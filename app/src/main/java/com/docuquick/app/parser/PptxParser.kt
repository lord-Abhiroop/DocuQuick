package com.docuquick.app.parser

import android.graphics.Color
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.util.Base64
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.BufferedInputStream
import java.io.InputStream
import java.util.TreeMap
import java.util.regex.Pattern
import java.util.zip.ZipInputStream

object PptxParser {

    /**
     * Parses a presentation into a rich visual HTML slide deck.
     * Extracts embedded images, diagrams, slide cards, tables, and typography.
     * Returns Pair(htmlContent, slideCount).
     */
    fun parseToHtml(inputStream: InputStream, isPptxHint: Boolean, isDark: Boolean): Pair<String, Int> {
        val bis = if (inputStream.markSupported()) inputStream else BufferedInputStream(inputStream)
        bis.mark(16)
        val header = ByteArray(8)
        val read = bis.read(header)
        bis.reset()

        val isZip = read >= 4 && header[0] == 0x50.toByte() && header[1] == 0x4B.toByte() &&
                header[2] == 0x03.toByte() && header[3] == 0x04.toByte()

        return if (isZip || isPptxHint) {
            parsePptxToHtml(bis, isDark)
        } else {
            parseLegacyPptToHtml(bis, isDark)
        }
    }

    private fun parsePptxToHtml(inputStream: InputStream, isDark: Boolean): Pair<String, Int> {
        val mediaMap = mutableMapOf<String, String>()
        val slideEntries = TreeMap<Int, ByteArray>()
        val relEntries = TreeMap<Int, ByteArray>()

        try {
            val zip = ZipInputStream(inputStream)
            var entry = zip.nextEntry
            val slidePattern = Pattern.compile("ppt/slides/slide(\\d+)\\.xml")
            val relPattern = Pattern.compile("ppt/slides/_rels/slide(\\d+)\\.xml\\.rels")

            while (entry != null) {
                val name = entry.name
                when {
                    name.startsWith("ppt/media/") -> {
                        val fileName = name.substringAfterLast('/')
                        val ext = fileName.substringAfterLast('.', "png").lowercase()
                        val mime = when (ext) {
                            "jpg", "jpeg" -> "image/jpeg"
                            "webp" -> "image/webp"
                            "gif" -> "image/gif"
                            "svg" -> "image/svg+xml"
                            else -> "image/png"
                        }
                        val bytes = zip.readBytes()
                        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        mediaMap[fileName] = "data:$mime;base64,$b64"
                    }
                    else -> {
                        val slideMatcher = slidePattern.matcher(name)
                        if (slideMatcher.matches()) {
                            val num = slideMatcher.group(1)?.toIntOrNull() ?: 1
                            slideEntries[num] = zip.readBytes()
                        } else {
                            val relMatcher = relPattern.matcher(name)
                            if (relMatcher.matches()) {
                                val num = relMatcher.group(1)?.toIntOrNull() ?: 1
                                relEntries[num] = zip.readBytes()
                            }
                        }
                    }
                }
                entry = zip.nextEntry
            }
            zip.close()
        } catch (e: Exception) {
            return Pair(buildErrorHtml("Unable to read PowerPoint file: ${e.localizedMessage}", isDark), 0)
        }

        if (slideEntries.isEmpty()) {
            return Pair(buildErrorHtml("Presentation contains no readable slides.", isDark), 0)
        }

        val totalSlides = slideEntries.size
        val htmlBuilder = StringBuilder()

        appendHtmlHeader(htmlBuilder, isDark)

        slideEntries.keys.forEach { slideNum ->
            val slideBytes = slideEntries[slideNum] ?: return@forEach
            val relBytes = relEntries[slideNum]
            val relMap = parseRelationships(relBytes)

            val slideHtml = renderSlideHtml(slideBytes, slideNum, totalSlides, relMap, mediaMap, isDark)
            htmlBuilder.append(slideHtml)
        }

        appendHtmlFooter(htmlBuilder)

        return Pair(htmlBuilder.toString(), totalSlides)
    }

    private fun parseRelationships(bytes: ByteArray?): Map<String, String> {
        if (bytes == null || bytes.isEmpty()) return emptyMap()
        val relMap = mutableMapOf<String, String>()
        try {
            val parser = Xml.newPullParser()
            parser.setInput(bytes.inputStream(), "UTF-8")
            var eventType = parser.eventType

            while (eventType != XmlPullParser.END_DOCUMENT) {
                if (eventType == XmlPullParser.START_TAG) {
                    val tag = (parser.name ?: "").substringAfter(':')
                    if (tag == "Relationship") {
                        val id = parser.getAttributeValue(null, "Id") ?: ""
                        val target = parser.getAttributeValue(null, "Target") ?: ""
                        if (id.isNotEmpty() && target.isNotEmpty()) {
                            relMap[id] = target.substringAfterLast('/')
                        }
                    }
                }
                eventType = parser.next()
            }
        } catch (e: Exception) {
            // Ignore relationship parsing error
        }
        return relMap
    }

    private fun renderSlideHtml(
        bytes: ByteArray,
        slideNum: Int,
        totalSlides: Int,
        relMap: Map<String, String>,
        mediaMap: Map<String, String>,
        isDark: Boolean
    ): String {
        val sb = StringBuilder()
        sb.append("<div class=\"slide-card\">\n")
        sb.append("  <div class=\"slide-header\">\n")
        sb.append("    <span class=\"slide-badge\">SLIDE $slideNum OF $totalSlides</span>\n")
        sb.append("  </div>\n")
        sb.append("  <div class=\"slide-body\">\n")

        val slideImages = mutableListOf<String>()
        val paragraphs = mutableListOf<Pair<Int, String>>()
        val tables = mutableListOf<List<List<String>>>()
        var explicitTitle = ""

        try {
            val parser = Xml.newPullParser()
            parser.setInput(bytes.inputStream(), "UTF-8")
            var eventType = parser.eventType

            var isTitleShape = false
            var inParagraph = false
            var paragraphLvl = 0
            val paraTextBuilder = StringBuilder()

            var inTable = false
            var inTableRow = false
            val currentTable = mutableListOf<List<String>>()
            val currentRow = mutableListOf<String>()
            val currentCellBuilder = StringBuilder()

            while (eventType != XmlPullParser.END_DOCUMENT) {
                val tag = (parser.name ?: "").substringAfter(':')

                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        when (tag) {
                            "sp" -> {
                                isTitleShape = false
                            }
                            "ph" -> {
                                val phType = parser.getAttributeValue(null, "type") ?: ""
                                if (phType.contains("title", ignoreCase = true) || phType.contains("ctrTitle", ignoreCase = true)) {
                                    isTitleShape = true
                                }
                            }
                            "cNvPr" -> {
                                val spName = parser.getAttributeValue(null, "name") ?: ""
                                if (spName.contains("title", ignoreCase = true)) {
                                    isTitleShape = true
                                }
                            }
                            "blip" -> {
                                val embedId = parser.getAttributeValue("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed")
                                    ?: parser.getAttributeValue(null, "embed")
                                    ?: parser.getAttributeValue(null, "r:embed") ?: ""
                                if (embedId.isNotEmpty()) {
                                    val fileName = relMap[embedId] ?: ""
                                    val dataUri = mediaMap[fileName]
                                    if (dataUri != null && !slideImages.contains(dataUri)) {
                                        slideImages.add(dataUri)
                                    }
                                }
                            }
                            "tbl" -> {
                                inTable = true
                                currentTable.clear()
                            }
                            "tr" -> {
                                inTableRow = true
                                currentRow.clear()
                            }
                            "tc" -> {
                                currentCellBuilder.clear()
                            }
                            "p" -> {
                                inParagraph = true
                                paragraphLvl = 0
                                paraTextBuilder.clear()
                            }
                            "pPr" -> {
                                val lvlAttr = parser.getAttributeValue(null, "lvl")
                                paragraphLvl = lvlAttr?.toIntOrNull() ?: 0
                            }
                            "t" -> {
                                val text = parser.nextText()
                                if (!text.isNullOrEmpty()) {
                                    if (inTable) {
                                        currentCellBuilder.append(text).append(" ")
                                    } else {
                                        paraTextBuilder.append(text)
                                    }
                                }
                            }
                            "br" -> {
                                if (inTable) {
                                    currentCellBuilder.append(" ")
                                } else {
                                    paraTextBuilder.append("\n")
                                }
                            }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        when (tag) {
                            "tc" -> {
                                val cellText = currentCellBuilder.toString().trim()
                                currentRow.add(cellText)
                            }
                            "tr" -> {
                                inTableRow = false
                                if (currentRow.any { it.isNotBlank() }) {
                                    currentTable.add(ArrayList(currentRow))
                                }
                            }
                            "tbl" -> {
                                inTable = false
                                if (currentTable.isNotEmpty()) {
                                    tables.add(ArrayList(currentTable))
                                }
                            }
                            "p" -> {
                                inParagraph = false
                                if (!inTable) {
                                    val text = paraTextBuilder.toString().trim()
                                    if (text.isNotEmpty()) {
                                        if (isTitleShape && explicitTitle.isEmpty()) {
                                            explicitTitle = text
                                        } else {
                                            paragraphs.add(Pair(paragraphLvl, text))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                eventType = parser.next()
            }
        } catch (e: Exception) {
            sb.append("<p class=\"slide-error\">[Error reading slide content: ${escapeHtml(e.localizedMessage ?: "")}]</p>\n")
        }

        // Determine Title
        val finalTitle = if (explicitTitle.isNotEmpty()) {
            explicitTitle
        } else if (paragraphs.isNotEmpty() && paragraphs[0].first == 0 && paragraphs[0].second.length <= 120) {
            val t = paragraphs.removeAt(0).second
            t
        } else {
            ""
        }

        if (finalTitle.isNotEmpty()) {
            sb.append("    <h2 class=\"slide-title\">${escapeHtml(finalTitle)}</h2>\n")
        }

        // Render Paragraphs
        var inList = false
        paragraphs.forEach { (lvl, text) ->
            if (lvl > 0) {
                if (!inList) {
                    sb.append("    <ul class=\"slide-list\">\n")
                    inList = true
                }
                sb.append("      <li class=\"slide-li lvl-$lvl\">${escapeHtml(text)}</li>\n")
            } else {
                if (inList) {
                    sb.append("    </ul>\n")
                    inList = false
                }
                sb.append("    <p class=\"slide-p\">${escapeHtml(text)}</p>\n")
            }
        }
        if (inList) {
            sb.append("    </ul>\n")
        }

        // Render Images (Presenter photos, system diagrams, charts)
        if (slideImages.isNotEmpty()) {
            sb.append("    <div class=\"slide-images-grid count-${slideImages.size.coerceAtMost(6)}\">\n")
            slideImages.forEach { dataUri ->
                sb.append("      <div class=\"slide-img-card\"><img class=\"slide-img\" src=\"$dataUri\" alt=\"Slide Graphic\" /></div>\n")
            }
            sb.append("    </div>\n")
        }

        // Render Tables
        tables.forEach { tbl ->
            sb.append("    <div class=\"table-container\"><table class=\"slide-table\">\n")
            tbl.forEachIndexed { rIdx, row ->
                sb.append("      <tr>\n")
                row.forEach { cell ->
                    val tag = if (rIdx == 0) "th" else "td"
                    sb.append("        <$tag>${escapeHtml(cell)}</$tag>\n")
                }
                sb.append("      </tr>\n")
            }
            sb.append("    </table></div>\n")
        }

        sb.append("  </div>\n")
        sb.append("</div>\n\n")

        return sb.toString()
    }

    private fun parseLegacyPptToHtml(inputStream: InputStream, isDark: Boolean): Pair<String, Int> {
        val ssb = SpannableStringBuilder()
        val bytes = inputStream.readBytes()
        val extractedLines = mutableListOf<String>()

        // 1. Scan for UTF-16LE text blocks
        var i = 0
        val sbUtf16 = StringBuilder()
        while (i < bytes.size - 1) {
            val b1 = bytes[i].toInt() and 0xFF
            val b2 = bytes[i + 1].toInt() and 0xFF
            if (b2 == 0 && (b1 in 32..126 || b1 == 10 || b1 == 13)) {
                sbUtf16.append(b1.toChar())
                i += 2
            } else {
                if (sbUtf16.length >= 4) {
                    val line = sbUtf16.toString().trim()
                    if (isValidPptLine(line)) {
                        extractedLines.add(line)
                    }
                }
                sbUtf16.clear()
                i++
            }
        }

        // 2. Scan for ASCII text blocks
        val sbAscii = StringBuilder()
        i = 0
        while (i < bytes.size) {
            val b = bytes[i].toInt() and 0xFF
            if (b in 32..126 || b == 10 || b == 13) {
                sbAscii.append(b.toChar())
            } else {
                if (sbAscii.length >= 5) {
                    val line = sbAscii.toString().trim()
                    if (isValidPptLine(line) && !extractedLines.contains(line)) {
                        extractedLines.add(line)
                    }
                }
                sbAscii.clear()
            }
            i++
        }

        val htmlBuilder = StringBuilder()
        appendHtmlHeader(htmlBuilder, isDark)

        htmlBuilder.append("<div class=\"slide-card\">\n")
        htmlBuilder.append("  <div class=\"slide-header\"><span class=\"slide-badge\">LEGACY POWERPOINT (.PPT)</span></div>\n")
        htmlBuilder.append("  <div class=\"slide-body\">\n")
        htmlBuilder.append("    <h2 class=\"slide-title\">Extracted Presentation Content</h2>\n")
        htmlBuilder.append("    <ul class=\"slide-list\">\n")

        extractedLines.take(300).forEach { line ->
            htmlBuilder.append("      <li class=\"slide-li\">${escapeHtml(line)}</li>\n")
        }

        htmlBuilder.append("    </ul>\n")
        htmlBuilder.append("  </div>\n")
        htmlBuilder.append("</div>\n")

        appendHtmlFooter(htmlBuilder)
        return Pair(htmlBuilder.toString(), 1)
    }

    private fun appendHtmlHeader(sb: StringBuilder, isDark: Boolean) {
        val bg = if (isDark) "#0B0F17" else "#F8FAFC"
        val cardBg = if (isDark) "#151D2A" else "#FFFFFF"
        val cardBorder = if (isDark) "#243247" else "#E2E8F0"
        val textPrimary = if (isDark) "#F8FAFC" else "#0F172A"
        val textSecondary = if (isDark) "#94A3B8" else "#64748B"
        val accent = if (isDark) "#38BDF8" else "#0284C7"
        val badgeBg = if (isDark) "#1E293B" else "#E0F2FE"
        val tableBorder = if (isDark) "#334155" else "#CBD5E1"
        val tableHeadBg = if (isDark) "#1E293B" else "#F1F5F9"

        sb.append("""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px 14px 64px 14px;
      background-color: $bg;
      color: $textPrimary;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      -webkit-text-size-adjust: 100%;
    }
    .slide-card {
      background: $cardBg;
      border: 1px solid $cardBorder;
      border-radius: 14px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
      margin-bottom: 24px;
      padding: 20px 18px;
    }
    .slide-header {
      margin-bottom: 12px;
    }
    .slide-badge {
      display: inline-block;
      background: $badgeBg;
      color: $accent;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .slide-title {
      color: $textPrimary;
      font-size: 19px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 12px;
      line-height: 1.35;
    }
    .slide-p {
      color: $textPrimary;
      font-size: 14px;
      margin: 8px 0;
      word-break: break-word;
    }
    .slide-list {
      margin: 8px 0;
      padding-left: 20px;
    }
    .slide-li {
      color: $textPrimary;
      font-size: 14px;
      margin-bottom: 6px;
      word-break: break-word;
    }
    .slide-li.lvl-1 { padding-left: 0; }
    .slide-li.lvl-2 { padding-left: 14px; list-style-type: circle; }
    .slide-li.lvl-3 { padding-left: 24px; list-style-type: square; }
    .slide-images-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 16px 0;
      justify-content: center;
    }
    .slide-img-card {
      flex: 1 1 140px;
      max-width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .slide-img {
      max-width: 100%;
      height: auto;
      max-height: 280px;
      border-radius: 8px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      object-fit: contain;
    }
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 14px 0;
      -webkit-overflow-scrolling: touch;
    }
    .slide-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .slide-table th {
      background: $tableHeadBg;
      color: $accent;
      font-weight: 600;
      padding: 9px 12px;
      border: 1px solid $tableBorder;
      text-align: left;
    }
    .slide-table td {
      padding: 9px 12px;
      border: 1px solid $tableBorder;
      color: $textPrimary;
    }
    .slide-table tr:nth-child(even) td {
      background: rgba(255, 255, 255, 0.02);
    }
    .slide-error {
      color: #F87171;
      font-size: 12px;
      font-style: italic;
    }
  </style>
</head>
<body>
        """.trimIndent())
    }

    private fun appendHtmlFooter(sb: StringBuilder) {
        sb.append("""
</body>
</html>
        """.trimIndent())
    }

    private fun buildErrorHtml(message: String, isDark: Boolean): String {
        val bg = if (isDark) "#0B0F17" else "#F8FAFC"
        val text = if (isDark) "#F8FAFC" else "#0F172A"
        return """
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{background:$bg;color:$text;font-family:sans-serif;padding:24px;text-align:center;}</style>
</head><body><h3>Unable to preview presentation</h3><p>${escapeHtml(message)}</p></body></html>
        """.trimIndent()
    }

    private fun escapeHtml(text: String): String {
        return text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
    }

    private fun isValidPptLine(line: String): Boolean {
        if (line.length < 3) return false
        if (line.startsWith("<?xml") || line.startsWith("http://") || line.startsWith("https://")) return false
        val blacklist = setOf(
            "Root Entry", "Pictures", "PowerPoint Document", "SummaryInformation",
            "Current User", "DocumentSummaryInformation", "Adobe Photoshop", "Photoshop",
            "Microsoft Equation", "Equation", "MSPhotoEd", "Times New Roman", "Arial", "Calibri"
        )
        return !blacklist.any { line.startsWith(it, ignoreCase = true) }
    }
}
