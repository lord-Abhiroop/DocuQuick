var VW_EPOCH = Date.UTC(1899, 11, 30);
function vwRuleValue(cell) {
if (!cell || cell.t === "z" || cell.v === undefined || cell.v === null || (cell.v === "" && !cell.f)) return null;
if (cell.t === "d" && cell.v instanceof Date) return (cell.v.getTime() - VW_EPOCH) / 86400000;
if (cell.t === "e") return { error: cell.w || "#N/A" };
return cell.v;
}
var VW_TOKEN = null;
function vwParseFormula(text) {
text = String(text || "").replace(/^\s*=/, "");
var tokens = [], at = 0;
if (!VW_TOKEN) {
try {
VW_TOKEN = new RegExp("\\s*(?:(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?%?)|(\"(?:[^\"]|\"\")*\")|" +
"(\\$?[A-Za-z]{1,3}\\$?\\d+)(?![\\w(])|([A-Za-z_][\\w.]*)\\s*\\(|(TRUE|FALSE)\\b|(<=|>=|<>|[-+*\\/^&=<>(),]))", "y");
} catch (e) {
return null;
}
}
while (at < text.length) {
if (/^\s+$/.test(text.slice(at))) break;
VW_TOKEN.lastIndex = at;
var m = VW_TOKEN.exec(text);
if (!m) return null;
at = VW_TOKEN.lastIndex;
if (m[1]) tokens.push({ k: "num", v: m[1].slice(-1) === "%" ? parseFloat(m[1]) / 100 : parseFloat(m[1]) });
else if (m[2]) tokens.push({ k: "str", v: m[2].slice(1, -1).replace(/""/g, '"') });
else if (m[3]) tokens.push({ k: "ref", v: m[3] });
else if (m[4]) tokens.push({ k: "fn", v: m[4].toUpperCase() });
else if (m[5]) tokens.push({ k: "bool", v: m[5].toUpperCase() === "TRUE" });
else tokens.push({ k: "op", v: m[6] });
}
var i = 0;
function peek(v) { return tokens[i] && tokens[i].k === "op" && tokens[i].v === v; }
function expect(v) {
if (!peek(v)) throw new Error("expected " + v);
i++;
}
function comparison() {
var a = concat();
while (tokens[i] && tokens[i].k === "op" && /^(=|<>|<|<=|>|>=)$/.test(tokens[i].v)) {
var op = tokens[i++].v;
a = { k: "op", op: op, a: a, b: concat() };
}
return a;
}
function concat() {
var a = additive();
while (peek("&")) { i++; a = { k: "op", op: "&", a: a, b: additive() }; }
return a;
}
function additive() {
var a = term();
while (peek("+") || peek("-")) { var op = tokens[i++].v; a = { k: "op", op: op, a: a, b: term() }; }
return a;
}
function term() {
var a = power();
while (peek("*") || peek("/")) { var op = tokens[i++].v; a = { k: "op", op: op, a: a, b: power() }; }
return a;
}
function power() {
var a = unary();
while (peek("^")) { i++; a = { k: "op", op: "^", a: a, b: unary() }; }
return a;
}
function unary() {
if (peek("-")) { i++; return { k: "neg", a: unary() }; }
if (peek("+")) { i++; return unary(); }
return primary();
}
function primary() {
var t = tokens[i++];
if (!t) throw new Error("ends early");
if (t.k === "num" || t.k === "str" || t.k === "bool") return t;
if (t.k === "ref") {
var m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(t.v);
return { k: "ref", c: vwColumnOf(m[2].toUpperCase()), r: +m[4] - 1, absC: !!m[1], absR: !!m[3] };
}
if (t.k === "fn") {
var args = [];
if (!peek(")")) {
args.push(comparison());
while (peek(",")) { i++; args.push(comparison()); }
}
expect(")");
return { k: "fn", name: t.v, args: args };
}
if (t.k === "op" && t.v === "(") {
var e = comparison();
expect(")");
return e;
}
throw new Error("unexpected " + t.v);
}
try {
var tree = comparison();
return i === tokens.length ? tree : null;
} catch (e) {
return null;
}
}
function vwRuleKind(v) {
return v === null ? 0 : typeof v === "number" ? 1 : typeof v === "string" ? 2 : typeof v === "boolean" ? 3 : 4;
}
function vwRuleCompare(a, b) {
if (a === null && typeof b === "string") a = "";
if (b === null && typeof a === "string") b = "";
if (a === null && typeof b === "number") a = 0;
if (b === null && typeof a === "number") b = 0;
if (a === null && typeof b === "boolean") a = false;
if (b === null && typeof a === "boolean") b = false;
var ka = vwRuleKind(a), kb = vwRuleKind(b);
if (ka !== kb) return ka < kb ? -1 : 1;
if (typeof a === "string") {
a = a.toLowerCase();
b = b.toLowerCase();
}
return a < b ? -1 : a > b ? 1 : 0;
}
function vwRuleNumber(v) {
if (v === null || v === false) return 0;
if (v === true) return 1;
if (typeof v === "number") return v;
if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return parseFloat(v);
throw new Error("not a number");
}
function vwRuleText(v) {
if (v === null) return "";
if (v === true) return "TRUE";
if (v === false) return "FALSE";
if (typeof v === "object") return v.error;
return String(v);
}
function VwUnknown(what) { this.what = what; }
function VwCarried(error) { this.error = error; }
function vwIsError(v) {
return typeof v === "object" && v !== null;
}
function vwTruthy(v) {
if (typeof v === "boolean") return v;
if (typeof v === "number") return v !== 0;
return false;
}
function vwEvaluate(node, sheet, r, c, origin) {
function value(n) { return vwEvaluate(n, sheet, r, c, origin); }
switch (node.k) {
case "num": case "str": case "bool": return node.v;
case "neg": var x = value(node.a); return vwIsError(x) ? x : -vwRuleNumber(x);
case "ref": {
var row = node.absR ? node.r : node.r + r - origin.r, col = node.absC ? node.c : node.c + c - origin.c;
if (row < 0 || col < 0) throw new Error("off the sheet");
return vwRuleValue(sheet.cell(row, col));
}
case "op": {
var a = value(node.a), b = value(node.b);
if (typeof a === "object" && a !== null) return a;
if (typeof b === "object" && b !== null) return b;
switch (node.op) {
case "=": return vwRuleCompare(a, b) === 0;
case "<>": return vwRuleCompare(a, b) !== 0;
case "<": return vwRuleCompare(a, b) < 0;
case "<=": return vwRuleCompare(a, b) <= 0;
case ">": return vwRuleCompare(a, b) > 0;
case ">=": return vwRuleCompare(a, b) >= 0;
case "&": return vwRuleText(a) + vwRuleText(b);
case "+": return vwRuleNumber(a) + vwRuleNumber(b);
case "-": return vwRuleNumber(a) - vwRuleNumber(b);
case "*": return vwRuleNumber(a) * vwRuleNumber(b);
case "/": return vwRuleNumber(b) === 0 ? { error: "#DIV/0!" } : vwRuleNumber(a) / vwRuleNumber(b);
case "^": return Math.pow(vwRuleNumber(a), vwRuleNumber(b));
}
throw new VwUnknown("operator");
}
case "fn": return vwFunction(node, value, r, c, origin);
}
throw new VwUnknown("node");
}
function vwFunction(node, value, r, c, origin) {
var args = node.args, n = args.length;
function arg(k) { var v = value(args[k]); if (vwIsError(v)) throw new VwCarried(v); return v; }
function asked(k) {
try {
return value(args[k]);
} catch (err) {
if (err instanceof VwUnknown) throw err;
return { error: "#VALUE!" };
}
}
function text(k) { return vwRuleText(arg(k)); }
function num(k) { return vwRuleNumber(arg(k)); }
var today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000 - VW_EPOCH) / 86400000);
try {
switch (node.name) {
case "AND": var all = n > 0; for (var a = 0; a < n; a++) if (!vwTruthy(arg(a))) all = false; return all;
case "OR": var any = false; for (var o = 0; o < n; o++) if (vwTruthy(arg(o))) any = true; return any;
case "NOT": return !vwTruthy(arg(0));
case "IF": return vwTruthy(arg(0)) ? (n > 1 ? arg(1) : true) : (n > 2 ? arg(2) : false);
case "ISBLANK": return asked(0) === null;
case "ISNUMBER": return typeof asked(0) === "number";
case "ISTEXT": return typeof asked(0) === "string";
case "ISERROR": return vwIsError(asked(0));
case "ISERR": var er = asked(0); return vwIsError(er) && er.error !== "#N/A";
case "ISNA": var na = asked(0); return vwIsError(na) && na.error === "#N/A";
case "ISEVEN": return Math.floor(Math.abs(num(0))) % 2 === 0;
case "ISODD": return Math.floor(Math.abs(num(0))) % 2 === 1;
case "MOD": var d = num(1); return d === 0 ? { error: "#DIV/0!" } : num(0) - d * Math.floor(num(0) / d);
case "ROW": return n && args[0].k === "ref" ? (args[0].absR ? args[0].r : args[0].r + r - origin.r) + 1 : r + 1;
case "COLUMN": return n && args[0].k === "ref" ? (args[0].absC ? args[0].c : args[0].c + c - origin.c) + 1 : c + 1;
case "ABS": return Math.abs(num(0));
case "INT": return Math.floor(num(0));
case "ROUND": var f = Math.pow(10, n > 1 ? num(1) : 0); return Math.round(num(0) * f) / f;
case "LEN": return text(0).length;
case "LEFT": return text(0).slice(0, n > 1 ? num(1) : 1);
case "RIGHT": var t = text(0), k = n > 1 ? num(1) : 1; return k > 0 ? t.slice(-k) : "";
case "MID": return text(0).substr(num(1) - 1, num(2));
case "UPPER": return text(0).toUpperCase();
case "LOWER": return text(0).toLowerCase();
case "TRIM": return text(0).replace(/\s+/g, " ").replace(/^ | $/g, "");
case "EXACT": return text(0) === text(1);
case "SEARCH": case "FIND": {
var within = text(1), sought = text(0), from = n > 2 ? num(2) - 1 : 0;
var where = node.name === "SEARCH" ? within.toLowerCase().indexOf(sought.toLowerCase(), from) : within.indexOf(sought, from);
return where < 0 ? { error: "#VALUE!" } : where + 1;
}
case "TODAY": return today;
case "NOW": return (Date.now() - new Date().getTimezoneOffset() * 60000 - VW_EPOCH) / 86400000;
case "DATE": return (Date.UTC(num(0), num(1) - 1, num(2)) - VW_EPOCH) / 86400000;
case "YEAR": return new Date(VW_EPOCH + num(0) * 86400000).getUTCFullYear();
case "MONTH": return new Date(VW_EPOCH + num(0) * 86400000).getUTCMonth() + 1;
case "DAY": return new Date(VW_EPOCH + num(0) * 86400000).getUTCDate();
case "WEEKDAY": return new Date(VW_EPOCH + num(0) * 86400000).getUTCDay() + 1;
}
} catch (err) {
if (err instanceof VwCarried) return err.error;
throw err;
}
throw new VwUnknown("function " + node.name);
}
function vwPercentile(values, p) {
if (!values.length) return 0;
var at = (values.length - 1) * Math.min(1, Math.max(0, p)), lo = Math.floor(at);
return lo + 1 < values.length ? values[lo] + (values[lo + 1] - values[lo]) * (at - lo) : values[lo];
}
function vwThreshold(cfvo, values, sheet, origin) {
var low = values[0], high = values[values.length - 1], v = parseFloat(cfvo.val);
switch (cfvo.type) {
case "min": return low;
case "max": return high;
case "autoMin": return Math.min(0, low);
case "autoMax": return Math.max(0, high);
case "num": return isNaN(v) ? vwFormulaConstant(cfvo.val, sheet, origin) : v;
case "percent": return low + (high - low) * (isNaN(v) ? 0 : v) / 100;
case "percentile": return vwPercentile(values, (isNaN(v) ? 50 : v) / 100);
case "formula": return vwFormulaConstant(cfvo.val, sheet, origin);
}
return low;
}
function vwFormulaConstant(text, sheet, origin) {
var tree = vwParseFormula(text);
if (!tree) throw new Error("formula");
return vwRuleNumber(vwEvaluate(tree, sheet, origin.r, origin.c, origin));
}
function vwScaleColour(v, stops, colours) {
if (v <= stops[0]) return colours[0];
for (var k = 1; k < stops.length; k++) {
if (v <= stops[k]) {
var span = stops[k] - stops[k - 1];
return vwBlend(colours[k - 1], colours[k], span > 0 ? (v - stops[k - 1]) / span : 1);
}
}
return colours[colours.length - 1];
}
function vwRuleKey(v) {
return typeof v === "string" ? "s" + v.toLowerCase() : typeof v + String(v);
}
function vwNodes(node) {
if (!node) return 0;
var n = 1 + vwNodes(node.a) + vwNodes(node.b);
for (var k = 0; node.args && k < node.args.length; k++) n += vwNodes(node.args[k]);
return n;
}
function vwEachCell(ranges, sheet, fn) {
for (var q = 0; q < ranges.length; q++) {
var g = ranges[q];
for (var r = g.s.r; r <= Math.min(g.e.r, sheet.lastRow); r++) {
for (var c = g.s.c; c <= Math.min(g.e.c, sheet.lastCol); c++) fn(r, c);
}
}
}
function vwRuleTest(rule, sheet) {
var test = vwRuleTestOf(rule, sheet);
if (test && !test.size) test.size = 1;
return test;
}
function vwRuleTestOf(rule, sheet) {
var origin = rule.ranges[0].s;
function numbers() {
var out = [];
vwEachCell(rule.ranges, sheet, function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (typeof v === "number") out.push(v);
});
return out.sort(function (x, y) { return x - y; });
}
var type = rule.type, text = (rule.text || "").toLowerCase();
if (type === "cellIs") {
var trees = rule.formulas.map(vwParseFormula);
if (!trees.length || trees.some(function (t) { return !t; })) return null;
var compared = function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (typeof v === "object" && v !== null) return false;
var a = vwEvaluate(trees[0], sheet, r, c, origin), b = trees[1] ? vwEvaluate(trees[1], sheet, r, c, origin) : null;
switch (rule.operator) {
case "between": case "notBetween":
var lo = vwRuleCompare(a, b) <= 0 ? a : b, hi = lo === a ? b : a;
var inside = vwRuleCompare(v, lo) >= 0 && vwRuleCompare(v, hi) <= 0;
return rule.operator === "between" ? inside : !inside;
case "equal": return vwRuleCompare(v, a) === 0;
case "notEqual": return vwRuleCompare(v, a) !== 0;
case "greaterThan": return vwRuleCompare(v, a) > 0;
case "lessThan": return vwRuleCompare(v, a) < 0;
case "greaterThanOrEqual": return vwRuleCompare(v, a) >= 0;
case "lessThanOrEqual": return vwRuleCompare(v, a) <= 0;
}
return false;
};
compared.size = trees.reduce(function (sum, t) { return sum + vwNodes(t); }, 1);
return compared;
}
if (type === "expression") {
var tree = vwParseFormula(rule.formulas[0]);
if (!tree) return null;
var worked = function (r, c) { return vwTruthy(vwEvaluate(tree, sheet, r, c, origin)); };
worked.size = vwNodes(tree);
return worked;
}
if (type === "colorScale" || type === "dataBar") {
var values = numbers();
if (!values.length || !rule.cfvos || rule.cfvos.length < 2 || !rule.colours || !rule.colours.length) return null;
var stops = rule.cfvos.map(function (cfvo) { return vwThreshold(cfvo, values, sheet, origin); });
if (type === "colorScale") {
if (rule.colours.length !== stops.length) return null;
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
return typeof v === "number" ? { fill: vwScaleColour(v, stops, rule.colours) } : false;
};
}
var low = stops[0], high = stops[stops.length - 1], lengths = rule.lengths || [10, 90];
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (typeof v !== "number") return false;
var f = high > low ? Math.min(1, Math.max(0, (v - low) / (high - low))) : 1;
return { bar: { colour: rule.colours[0], width: Math.round(lengths[0] + (lengths[1] - lengths[0]) * f) } };
};
}
if (type === "top10") {
var sorted = numbers();
if (!sorted.length) return null;
var count = rule.percent ? Math.max(1, Math.floor(sorted.length * rule.rank / 100)) : Math.min(rule.rank, sorted.length);
var edge = rule.bottom ? sorted[count - 1] : sorted[sorted.length - count];
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
return typeof v === "number" && (rule.bottom ? v <= edge : v >= edge);
};
}
if (type === "aboveAverage") {
var all = numbers();
if (!all.length) return null;
var mean = all.reduce(function (s, v) { return s + v; }, 0) / all.length;
var sd = Math.sqrt(all.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / Math.max(1, all.length - 1));
var limit = mean + (rule.above ? 1 : -1) * rule.deviations * sd;
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (typeof v !== "number") return false;
return rule.above ? (rule.equal ? v >= limit : v > limit) : (rule.equal ? v <= limit : v < limit);
};
}
if (type === "duplicateValues" || type === "uniqueValues") {
var seen = {};
vwEachCell(rule.ranges, sheet, function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (v === null || v === "") return;
var key = vwRuleKey(v);
seen[key] = (seen[key] || 0) + 1;
});
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
if (v === null || v === "") return false;
return type === "duplicateValues" ? seen[vwRuleKey(v)] > 1 : seen[vwRuleKey(v)] === 1;
};
}
if (type === "containsText" || type === "notContainsText" || type === "beginsWith" || type === "endsWith") {
return function (r, c) {
var v = vwRuleText(vwRuleValue(sheet.cell(r, c))).toLowerCase();
if (type === "containsText") return v.indexOf(text) >= 0;
if (type === "notContainsText") return v.indexOf(text) < 0;
if (type === "beginsWith") return v.slice(0, text.length) === text;
return text.length <= v.length && v.slice(v.length - text.length) === text;
};
}
if (type === "containsBlanks" || type === "notContainsBlanks") {
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
var blank = v === null || (typeof v === "string" && !v.trim());
return type === "containsBlanks" ? blank : !blank;
};
}
if (type === "containsErrors" || type === "notContainsErrors") {
return function (r, c) {
var v = vwRuleValue(sheet.cell(r, c));
var error = typeof v === "object" && v !== null;
return type === "containsErrors" ? error : !error;
};
}
return null;
}
var VW_RULE_WORK = 1e7;
function vwConditional(sheet) {
var rules = sheet.style.rules;
if (!rules || !rules.length) return null;
var rows = [], any = false, work = 0;
for (var k = 0; k < rules.length; k++) {
var rule = rules[k], count = 0;
vwEachRange(rule.ranges, sheet, function (cells) { count += cells; });
if (!count) continue;
var test;
try {
test = vwRuleTest(rule, sheet);
} catch (e) {
test = null;
}
if (!test || work + count * test.size > VW_RULE_WORK) continue;
work += count * test.size;
if (vwRuleApply(rule, test, sheet, rows)) any = true;
}
return any ? rows : null;
}
function vwEachRange(ranges, sheet, fn) {
for (var q = 0; q < ranges.length; q++) {
var g = ranges[q];
var down = Math.min(g.e.r, sheet.lastRow) - g.s.r + 1, across = Math.min(g.e.c, sheet.lastCol) - g.s.c + 1;
if (down > 0 && across > 0) fn(down * across);
}
}
function vwRuleApply(rule, test, sheet, rows) {
var made = {}, gave = false;
vwEachCell(rule.ranges, sheet, function (r, c) {
var row = rows[r], state = row && row[c];
if (state && state.stopped) return;
var result;
try {
result = test(r, c);
} catch (e) {
result = false;
}
if (!result) return;
gave = true;
if (!state) {
var key = result === true ? "" : result.fill ? "f" + result.fill : "b" + result.bar.width;
(row || (rows[r] = []))[c] = made[key] || (made[key] = vwRuleAdd({ shared: true }, rule, result));
return;
}
if (state.shared) {
var own = {};
for (var field in state) if (state.hasOwnProperty(field) && field !== "shared") own[field] = state[field];
state = row[c] = own;
}
vwRuleAdd(state, rule, result);
});
return gave;
}
function vwRuleAdd(state, rule, result) {
if (result === true) {
var look = rule.look || {};
for (var field in look) {
if (look.hasOwnProperty(field) && state[field] === undefined) state[field] = look[field];
}
} else if (result.fill && state.fill === undefined) {
state.fill = result.fill;
} else if (result.bar && state.bar === undefined) {
state.bar = result.bar;
}
if (rule.stop) state.stopped = true;
return state;
}