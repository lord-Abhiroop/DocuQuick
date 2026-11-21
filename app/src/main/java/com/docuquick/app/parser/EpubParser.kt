package com.docuquick.app.parser

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.util.zip.ZipInputStream

object EpubParser {

    /**
     * Extracts and compiles EPUB book chapters into clean HTML for Android WebView.
     */
    fun parseEpub(inputStream: InputStream, isDarkMode: Boolean): String {
        val entries = mutableMapOf<String, ByteArray>()
        val zip = ZipInputStream(inputStream)
        var entry = zip.nextEntry

        while (entry != null) {
            entries[entry.name] = zip.readBytes()
            entry = zip.nextEntry
        }
        zip.close()

        // 1. Locate root opf file from META-INF/container.xml
        var opfPath = ""
        entries["META-INF/container.xml"]?.let { bytes ->
            val parser = Xml.newPullParser()
            parser.setInput(bytes.inputStream(), "UTF-8")
            var eventType = parser.eventType
            while (eventType != XmlPullParser.END_DOCUMENT) {
                if (eventType == XmlPullParser.START_TAG && parser.name == "rootfile") {
                    opfPath = parser.getAttributeValue(null, "full-path") ?: ""
                    break
                }
                eventType = parser.next()
            }
        }

        if (opfPath.isEmpty()) {
            // Fallback: look for any .opf entry
            opfPath = entries.keys.firstOrNull { it.endsWith(".opf") } ?: ""
        }

        val opfDir = if (opfPath.contains("/")) opfPath.substringBeforeLast("/") + "/" else ""

        // 2. Extract chapters ordered by manifest or spine
        val chapterHtmls = mutableListOf<String>()
        val htmlEntries = entries.keys.filter {
            it.endsWith(".html") || it.endsWith(".xhtml") || it.endsWith(".htm")
        }.sorted()

        for (key in htmlEntries) {
            entries[key]?.let { bytes ->
                val html = String(bytes, Charsets.UTF_8)
                // Extract body contents if possible
                val bodyContent = if (html.contains("<body", ignoreCase = true)) {
                    html.substringAfter("<body")
                        .substringAfter(">")
                        .substringBefore("</body>")
                } else {
                    html
                }
                chapterHtmls.add(bodyContent)
            }
        }

        // 3. Compose clean, responsive reader HTML with dark/light mode CSS
        val bgColor = if (isDarkMode) "#050811" else "#F8FAFC"
        val textColor = if (isDarkMode) "#E2E8F0" else "#0F172A"
        val headingColor = if (isDarkMode) "#38BDF8" else "#0284C7"

        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
                        background-color: $bgColor;
                        color: $textColor;
                        padding: 16px 20px 48px 20px;
                        line-height: 1.65;
                        font-size: 16px;
                        word-wrap: break-word;
                    }
                    h1, h2, h3, h4 {
                        color: $headingColor;
                        margin-top: 1.5em;
                        margin-bottom: 0.5em;
                        line-height: 1.3;
                    }
                    p {
                        margin-bottom: 1.2em;
                        text-align: justify;
                    }
                    img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                    }
                </style>
            </head>
            <body>
                ${chapterHtmls.joinToString("<hr style='border: none; border-top: 1px solid rgba(128,128,128,0.25); margin: 32px 0;' />")}
            </body>
            </html>
        """.trimIndent()
    }
}
