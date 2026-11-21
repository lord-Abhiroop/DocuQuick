package com.docuquick.app.parser

import android.graphics.Color
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.BackgroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan

object MarkdownParser {

    /**
     * Parses Markdown text into a styled SpannableStringBuilder with comfortable spacing.
     */
    fun parseMarkdown(raw: String): SpannableStringBuilder {
        val ssb = SpannableStringBuilder()
        val lines = raw.lines()
        var inCodeBlock = false
        val codeBlockBuilder = StringBuilder()

        for (line in lines) {
            val trimmed = line.trimEnd()

            // Code block fence
            if (trimmed.startsWith("```")) {
                if (inCodeBlock) {
                    // End code block
                    appendCodeBlock(ssb, codeBlockBuilder.toString())
                    codeBlockBuilder.clear()
                    inCodeBlock = false
                } else {
                    inCodeBlock = true
                }
                continue
            }

            if (inCodeBlock) {
                codeBlockBuilder.append(line).append("\n")
                continue
            }

            // Headings
            when {
                trimmed.startsWith("# ") -> {
                    appendHeading(ssb, trimmed.substring(2), 1.50f)
                }
                trimmed.startsWith("## ") -> {
                    appendHeading(ssb, trimmed.substring(3), 1.35f)
                }
                trimmed.startsWith("### ") -> {
                    appendHeading(ssb, trimmed.substring(4), 1.20f)
                }
                trimmed.startsWith("#### ") -> {
                    appendHeading(ssb, trimmed.substring(5), 1.10f)
                }
                trimmed.startsWith("> ") -> {
                    // Blockquote
                    val start = ssb.length
                    ssb.append("▎ ")
                    appendInlineStyled(ssb, trimmed.substring(2))
                    ssb.setSpan(StyleSpan(Typeface.ITALIC), start, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    ssb.append("\n\n")
                }
                trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                    // Bullet item
                    val start = ssb.length
                    ssb.append("  •  ")
                    appendInlineStyled(ssb, trimmed.substring(2))
                    ssb.append("\n")
                }
                trimmed.matches(Regex("^\\d+\\.\\s.*")) -> {
                    // Numbered list
                    val num = trimmed.substringBefore('.')
                    val rest = trimmed.substringAfter(". ")
                    ssb.append("  $num. ")
                    appendInlineStyled(ssb, rest)
                    ssb.append("\n")
                }
                trimmed == "---" || trimmed == "***" -> {
                    // Horizontal rule
                    ssb.append("─────────────────────────────────────\n\n")
                }
                trimmed.isEmpty() -> {
                    ssb.append("\n")
                }
                else -> {
                    appendInlineStyled(ssb, trimmed)
                    ssb.append("\n\n")
                }
            }
        }

        if (inCodeBlock && codeBlockBuilder.isNotEmpty()) {
            appendCodeBlock(ssb, codeBlockBuilder.toString())
        }

        return ssb
    }

    private fun appendHeading(ssb: SpannableStringBuilder, text: String, scale: Float) {
        val start = ssb.length
        appendInlineStyled(ssb, text)
        val end = ssb.length
        ssb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        ssb.setSpan(RelativeSizeSpan(scale), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        ssb.append("\n\n")
    }

    private fun appendCodeBlock(ssb: SpannableStringBuilder, code: String) {
        val start = ssb.length
        ssb.append(code.trimEnd())
        val end = ssb.length
        ssb.setSpan(TypefaceSpan("monospace"), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        ssb.setSpan(BackgroundColorSpan(Color.parseColor("#1A2234")), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        ssb.setSpan(LeadingMarginSpan.Standard(24), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        ssb.append("\n\n")
    }

    private fun appendInlineStyled(ssb: SpannableStringBuilder, text: String) {
        var i = 0
        while (i < text.length) {
            // Bold **text**
            if (i + 1 < text.length && text[i] == '*' && text[i + 1] == '*') {
                val close = text.indexOf("**", i + 2)
                if (close != -1) {
                    val start = ssb.length
                    ssb.append(text.substring(i + 2, close))
                    ssb.setSpan(StyleSpan(Typeface.BOLD), start, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    i = close + 2
                    continue
                }
            }
            // Inline code `code`
            if (text[i] == '`') {
                val close = text.indexOf('`', i + 1)
                if (close != -1) {
                    val start = ssb.length
                    ssb.append(text.substring(i + 1, close))
                    ssb.setSpan(TypefaceSpan("monospace"), start, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    ssb.setSpan(BackgroundColorSpan(Color.parseColor("#263248")), start, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    i = close + 1
                    continue
                }
            }
            // Italic *text*
            if (text[i] == '*') {
                val close = text.indexOf('*', i + 1)
                if (close != -1) {
                    val start = ssb.length
                    ssb.append(text.substring(i + 1, close))
                    ssb.setSpan(StyleSpan(Typeface.ITALIC), start, ssb.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    i = close + 1
                    continue
                }
            }

            ssb.append(text[i])
            i++
        }
    }
}
