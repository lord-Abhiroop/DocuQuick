package com.docuquick.app.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.ContextCompat
import com.docuquick.app.R
import kotlin.math.max

object SnippetCardGenerator {

    fun generateSnippetCard(
        context: Context,
        snippetBitmap: Bitmap,
        documentName: String,
        documentCategory: String
    ): Bitmap {
        val density = context.resources.displayMetrics.density

        // Desired target card width: comfortable minimum width so cards look premium and spacious
        val padding = 24f * density
        val minInnerWidth = 320f * density
        val targetInnerWidth = max(snippetBitmap.width.toFloat(), minInnerWidth)
        val cardWidth = (targetInnerWidth + (padding * 2)).toInt()
        val contentWidth = targetInnerWidth.toInt().coerceAtLeast(200)

        // Scale snippet proportionally to fit within inner width
        val scale = targetInnerWidth / snippetBitmap.width.toFloat()
        val scaledSnippetW = targetInnerWidth
        val scaledSnippetH = snippetBitmap.height * scale

        // Pre-create Quote and Author layouts using StaticLayout to guarantee multi-line wrapping and exact height measurement
        val quoteText = "“Life eventually gets better when obstacles become the only correct path”"
        val quotePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CBD5E1")
            textSize = 12f * density
            textSkewX = -0.12f // subtle elegant italic
        }

        val quoteLayout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            StaticLayout.Builder.obtain(quoteText, 0, quoteText.length, quotePaint, contentWidth)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setLineSpacing(3f * density, 1f)
                .setIncludePad(false)
                .build()
        } else {
            @Suppress("DEPRECATION")
            StaticLayout(quoteText, quotePaint, contentWidth, Layout.Alignment.ALIGN_NORMAL, 1f, 3f * density, false)
        }

        val authorText = "— Abhiroop Ghosh  •  DocuQuick Document Viewer"
        val authorPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#94A3B8")
            textSize = 10f * density
        }

        val authorLayout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            StaticLayout.Builder.obtain(authorText, 0, authorText.length, authorPaint, contentWidth)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setLineSpacing(2f * density, 1f)
                .setIncludePad(false)
                .build()
        } else {
            @Suppress("DEPRECATION")
            StaticLayout(authorText, authorPaint, contentWidth, Layout.Alignment.ALIGN_NORMAL, 1f, 2f * density, false)
        }

        val headerTop = padding
        val iconSize = (22f * density).toInt()
        val snippetTop = headerTop + (48f * density)
        val snippetBottom = snippetTop + scaledSnippetH

        val dividerY = snippetBottom + (16f * density)
        val quoteTop = dividerY + (12f * density)
        val authorTop = quoteTop + quoteLayout.height + (8f * density)
        val cardHeight = (authorTop + authorLayout.height + padding).toInt()

        val resultBitmap = Bitmap.createBitmap(cardWidth, cardHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(resultBitmap)

        // 1. Draw Card Background (Deep Slate #0B0F19)
        val cardRect = RectF(0f, 0f, cardWidth.toFloat(), cardHeight.toFloat())
        val cornerRadius = 20f * density
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#0B0F19")
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(cardRect, cornerRadius, cornerRadius, bgPaint)

        // 2. Draw Subtle Card Border (#1E293B)
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1E293B")
            style = Paint.Style.STROKE
            strokeWidth = 2f * density
        }
        canvas.drawRoundRect(cardRect, cornerRadius, cornerRadius, borderPaint)

        // 3. Header: App Icon + Name + Category Pill + Document Title
        val iconDrawable = ContextCompat.getDrawable(context, R.drawable.ic_launcher)
        iconDrawable?.let {
            it.setBounds(padding.toInt(), headerTop.toInt(), (padding + iconSize).toInt(), (headerTop + iconSize).toInt())
            it.draw(canvas)
        }

        // App Label
        val appLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#38BDF8") // Sky Blue Accent
            textSize = 13f * density
            isFakeBoldText = true
        }
        val textStartX = padding + iconSize + (8f * density)
        canvas.drawText("DocuQuick Snippet", textStartX, headerTop + (16f * density), appLabelPaint)

        // Document Category Pill
        val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1E293B")
            style = Paint.Style.FILL
        }
        val pillTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#94A3B8")
            textSize = 10f * density
            isFakeBoldText = true
        }
        val catText = documentCategory.uppercase()
        val catTextW = pillTextPaint.measureText(catText)
        val pillRect = RectF(
            cardWidth - padding - catTextW - (16f * density),
            headerTop,
            cardWidth - padding,
            headerTop + (22f * density)
        )
        canvas.drawRoundRect(pillRect, 6f * density, 6f * density, pillPaint)
        canvas.drawText(catText, pillRect.left + (8f * density), pillRect.centerY() + (3.5f * density), pillTextPaint)

        // Document Title
        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E2E8F0")
            textSize = 12f * density
        }
        val titleY = headerTop + (34f * density)
        val maxTitleW = contentWidth.toFloat()
        var displayTitle = documentName
        if (titlePaint.measureText(displayTitle) > maxTitleW) {
            while (displayTitle.length > 4 && titlePaint.measureText("$displayTitle…") > maxTitleW) {
                displayTitle = displayTitle.dropLast(1)
            }
            displayTitle = "$displayTitle…"
        }
        canvas.drawText(displayTitle, padding, titleY, titlePaint)

        // 4. Draw Cropped Snippet Image with rounded frame
        val snippetDestRect = RectF(padding, snippetTop, padding + scaledSnippetW, snippetBottom)
        canvas.save()
        val clipPath = android.graphics.Path().apply {
            addRoundRect(snippetDestRect, 10f * density, 10f * density, android.graphics.Path.Direction.CW)
        }
        canvas.clipPath(clipPath)
        val srcRect = android.graphics.Rect(0, 0, snippetBitmap.width, snippetBitmap.height)
        canvas.drawBitmap(snippetBitmap, srcRect, snippetDestRect, Paint(Paint.FILTER_BITMAP_FLAG))
        canvas.restore()

        // Border around snippet
        val snippetBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#334155")
            style = Paint.Style.STROKE
            strokeWidth = 1.5f * density
        }
        canvas.drawRoundRect(snippetDestRect, 10f * density, 10f * density, snippetBorderPaint)

        // 5. Footer: Divider line + Multi-line Quote + Attribution
        val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1E293B")
            strokeWidth = 1f * density
        }
        canvas.drawLine(padding, dividerY, cardWidth - padding, dividerY, dividerPaint)

        // Draw Quote using StaticLayout (guarantees multi-line wrap with 0% truncation)
        canvas.save()
        canvas.translate(padding, quoteTop)
        quoteLayout.draw(canvas)
        canvas.restore()

        // Draw Author Attribution using StaticLayout
        canvas.save()
        canvas.translate(padding, authorTop)
        authorLayout.draw(canvas)
        canvas.restore()

        return resultBitmap
    }
}
