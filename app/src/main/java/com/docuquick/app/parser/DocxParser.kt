package com.docuquick.app.parser

import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.text.style.StrikethroughSpan
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.util.zip.ZipInputStream

object DocxParser {

    /**
     * Parses a DOCX input stream into a styled, cleanly spaced SpannableStringBuilder.
     * Operates with 0 external dependencies using streaming XML parsing for instant speed.
     */
    fun parseDocx(inputStream: InputStream): SpannableStringBuilder {
        val ssb = SpannableStringBuilder()
        try {
            val zip = ZipInputStream(inputStream)
            var entry = zip.nextEntry

            while (entry != null) {
                if (entry.name == "word/document.xml") {
                    parseDocumentXml(zip, ssb)
                    break
                }
                entry = zip.nextEntry
            }
            zip.close()
        } catch (e: Exception) {
            return SpannableStringBuilder("Unable to parse Word document: ${e.localizedMessage}")
        }

        return if (ssb.isNotEmpty()) ssb else SpannableStringBuilder("Document is empty.")
    }

    private fun parseDocumentXml(input: InputStream, ssb: SpannableStringBuilder) {
        val parser = Xml.newPullParser()
        parser.setInput(input, "UTF-8")

        var eventType = parser.eventType
        var inParagraph = false
        var isHeading = false
        var headingLevel = 1
        var isBold = false
        var isItalic = false
        var isUnderline = false
        var isStrike = false
        var runStart = 0

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val name = (parser.name ?: "").substringAfter(':')

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    when (name) {
                        "p" -> {
                            inParagraph = true
                            isHeading = false
                            headingLevel = 1
                        }
                        "pStyle" -> {
                            val styleVal = parser.getAttributeValue(null, "val")
                                ?: parser.getAttributeValue(null, "w:val") ?: ""
                            if (styleVal.contains("Heading", ignoreCase = true) || styleVal.contains("Title", ignoreCase = true)) {
                                isHeading = true
                                headingLevel = styleVal.filter { it.isDigit() }.toIntOrNull() ?: 1
                            }
                        }
                        "r" -> {
                            isBold = false
                            isItalic = false
                            isUnderline = false
                            isStrike = false
                            runStart = ssb.length
                        }
                        "b" -> isBold = true
                        "i" -> isItalic = true
                        "u" -> isUnderline = true
                        "strike" -> isStrike = true
                        "t" -> {
                            val text = parser.nextText()
                            if (!text.isNullOrEmpty()) {
                                ssb.append(text)
                                val end = ssb.length

                                if (isBold) {
                                    ssb.setSpan(StyleSpan(Typeface.BOLD), runStart, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                }
                                if (isItalic) {
                                    ssb.setSpan(StyleSpan(Typeface.ITALIC), runStart, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                }
                                if (isUnderline) {
                                    ssb.setSpan(UnderlineSpan(), runStart, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                }
                                if (isStrike) {
                                    ssb.setSpan(StrikethroughSpan(), runStart, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                }
                            }
                        }
                        "tab" -> ssb.append("    ")
                        "br" -> ssb.append("\n")
                        "tbl" -> ssb.append("\n")
                        "tr" -> { /* row start */ }
                        "tc" -> { /* cell start */ }
                    }
                }
                XmlPullParser.END_TAG -> {
                    when (name) {
                        "p" -> {
                            if (isHeading) {
                                val scale = when (headingLevel) {
                                    1 -> 1.45f
                                    2 -> 1.30f
                                    3 -> 1.18f
                                    else -> 1.10f
                                }
                                val pStart = (ssb.lastIndexOf('\n') + 1).coerceAtLeast(0)
                                if (pStart < ssb.length) {
                                    ssb.setSpan(StyleSpan(Typeface.BOLD), pStart, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                    ssb.setSpan(RelativeSizeSpan(scale), pStart, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                                }
                            }
                            ssb.append("\n\n")
                            inParagraph = false
                        }
                        "tc" -> ssb.append("  │  ")
                        "tr" -> ssb.append("\n")
                    }
                }
            }
            eventType = parser.next()
        }
    }
}
