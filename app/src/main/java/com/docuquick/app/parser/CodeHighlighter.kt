package com.docuquick.app.parser

import android.graphics.Color
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.ForegroundColorSpan
import android.text.style.TypefaceSpan
import org.json.JSONArray
import org.json.JSONObject

object CodeHighlighter {

    /**
     * Formats and syntax highlights code/data files (JSON, XML, Python, JS, etc.)
     */
    fun highlightCode(raw: String, extension: String): SpannableStringBuilder {
        val formatted = when (extension) {
            "json" -> prettyPrintJson(raw)
            else -> raw
        }

        val ssb = SpannableStringBuilder()
        val lines = formatted.lines()
        val totalLines = lines.size
        val lineNumWidth = totalLines.toString().length

        val colorGutter = Color.parseColor("#64748B")
        val colorKeyword = Color.parseColor("#0284C7")
        val colorString = Color.parseColor("#16A34A")
        val colorComment = Color.parseColor("#94A3B8")
        val colorNumber = Color.parseColor("#D97706")

        val keywords = setOf(
            "val", "var", "fun", "class", "interface", "object", "return", "if", "else",
            "for", "while", "import", "package", "public", "private", "protected",
            "const", "let", "function", "def", "async", "await", "from", "as", "try", "catch"
        )

        lines.forEachIndexed { index, line ->
            val lineNum = (index + 1).toString().padStart(lineNumWidth, ' ')
            val gutterStart = ssb.length
            ssb.append("$lineNum │ ")
            ssb.setSpan(ForegroundColorSpan(colorGutter), gutterStart, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)

            val codeStart = ssb.length
            ssb.append(line)
            val codeEnd = ssb.length

            // Highlight comments
            val commentIdx = line.indexOf("//").takeIf { it != -1 } ?: line.indexOf("#").takeIf { it != -1 } ?: -1
            if (commentIdx != -1) {
                ssb.setSpan(
                    ForegroundColorSpan(colorComment),
                    codeStart + commentIdx,
                    codeEnd,
                    Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                )
            } else {
                // Highlight keywords & strings
                val tokens = line.split(Regex("(?<=[^a-zA-Z0-9_])|(?=[^a-zA-Z0-9_])"))
                var currentOffset = codeStart
                tokens.forEach { token ->
                    if (token in keywords) {
                        ssb.setSpan(
                            ForegroundColorSpan(colorKeyword),
                            currentOffset,
                            currentOffset + token.length,
                            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                        )
                    } else if (token.startsWith("\"") && token.endsWith("\"")) {
                        ssb.setSpan(
                            ForegroundColorSpan(colorString),
                            currentOffset,
                            currentOffset + token.length,
                            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                        )
                    } else if (token.toIntOrNull() != null) {
                        ssb.setSpan(
                            ForegroundColorSpan(colorNumber),
                            currentOffset,
                            currentOffset + token.length,
                            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                        )
                    }
                    currentOffset += token.length
                }
            }

            ssb.append("\n")
        }

        // Apply monospaced font to the whole text
        ssb.setSpan(TypefaceSpan("monospace"), 0, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        return ssb
    }

    private fun prettyPrintJson(raw: String): String {
        return try {
            val trimmed = raw.trim()
            if (trimmed.startsWith("{")) {
                JSONObject(trimmed).toString(2)
            } else if (trimmed.startsWith("[")) {
                JSONArray(trimmed).toString(2)
            } else raw
        } catch (e: Exception) {
            raw
        }
    }
}
