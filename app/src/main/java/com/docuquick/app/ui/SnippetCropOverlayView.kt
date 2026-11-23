package com.docuquick.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

/**
 * Interactive visual crop overlay allowing user to drag/resize a crop rectangle over any document view.
 */
class SnippetCropOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val density = context.resources.displayMetrics.density
    val cropRect = RectF()

    private val minSize = 48f * density
    private val touchSlop = 28f * density

    private var activeHandle = HANDLE_NONE
    private var lastTouchX = 0f
    private var lastTouchY = 0f

    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(160, 10, 15, 26) // 63% dim
        style = Paint.Style.FILL
    }

    private val clearPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
    }

    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#38BDF8") // High-contrast Sky Blue
        style = Paint.Style.STROKE
        strokeWidth = 2.5f * density
    }

    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(60, 255, 255, 255)
        style = Paint.Style.STROKE
        strokeWidth = 1f * density
    }

    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }

    private val handleStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#0284C7")
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
    }

    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 11f * density
        textAlign = Paint.Align.CENTER
    }

    private val textBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(200, 15, 23, 42)
        style = Paint.Style.FILL
    }

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (cropRect.isEmpty && w > 0 && h > 0) {
            val rectW = w * 0.82f
            val rectH = h * 0.38f
            val left = (w - rectW) / 2f
            val top = (h - rectH) / 2f
            cropRect.set(left, top, left + rectW, top + rectH)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width <= 0 || height <= 0 || cropRect.isEmpty) return

        // 1. Draw outer dim overlay
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), dimPaint)

        // 2. Punch clear aperture hole
        canvas.drawRect(cropRect, clearPaint)

        // 3. Draw Rule-of-Thirds Grid lines inside crop
        val thirdW = cropRect.width() / 3f
        val thirdH = cropRect.height() / 3f
        canvas.drawLine(cropRect.left + thirdW, cropRect.top, cropRect.left + thirdW, cropRect.bottom, gridPaint)
        canvas.drawLine(cropRect.left + 2 * thirdW, cropRect.top, cropRect.left + 2 * thirdW, cropRect.bottom, gridPaint)
        canvas.drawLine(cropRect.left, cropRect.top + thirdH, cropRect.right, cropRect.top + thirdH, gridPaint)
        canvas.drawLine(cropRect.left, cropRect.top + 2 * thirdH, cropRect.right, cropRect.top + 2 * thirdH, gridPaint)

        // 4. Draw border
        canvas.drawRect(cropRect, borderPaint)

        // 5. Draw 4 corner handles
        val radius = 6f * density
        val corners = arrayOf(
            Pair(cropRect.left, cropRect.top),
            Pair(cropRect.right, cropRect.top),
            Pair(cropRect.left, cropRect.bottom),
            Pair(cropRect.right, cropRect.bottom)
        )
        for (corner in corners) {
            canvas.drawCircle(corner.first, corner.second, radius, handlePaint)
            canvas.drawCircle(corner.first, corner.second, radius, handleStrokePaint)
        }

        // 6. Draw dimension pill at top of crop box
        val dimText = "${cropRect.width().toInt()} × ${cropRect.height().toInt()} px"
        val textW = textPaint.measureText(dimText)
        val pillH = 18f * density
        val pillW = textW + 16f * density
        val pillY = if (cropRect.top > pillH + 8f * density) cropRect.top - pillH - 6f * density else cropRect.top + 10f * density
        val pillRect = RectF(cropRect.centerX() - pillW / 2f, pillY, cropRect.centerX() + pillW / 2f, pillY + pillH)
        canvas.drawRoundRect(pillRect, pillH / 2f, pillH / 2f, textBgPaint)
        canvas.drawText(dimText, pillRect.centerX(), pillRect.centerY() + 4f * density, textPaint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastTouchX = x
                lastTouchY = y
                activeHandle = getHitHandle(x, y)
                if (activeHandle == HANDLE_OUTSIDE) {
                    // Start new crop box at this touch point
                    cropRect.set(x, y, x + minSize, y + minSize)
                    activeHandle = HANDLE_BOTTOM_RIGHT
                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = x - lastTouchX
                val dy = y - lastTouchY
                lastTouchX = x
                lastTouchY = y

                when (activeHandle) {
                    HANDLE_CENTER -> {
                        val w = cropRect.width()
                        val h = cropRect.height()
                        var newL = cropRect.left + dx
                        var newT = cropRect.top + dy
                        if (newL < 0f) newL = 0f
                        if (newL + w > width) newL = width - w
                        if (newT < 0f) newT = 0f
                        if (newT + h > height) newT = height - h
                        cropRect.set(newL, newT, newL + w, newT + h)
                    }
                    HANDLE_TOP_LEFT -> {
                        val newL = (cropRect.left + dx).coerceIn(0f, cropRect.right - minSize)
                        val newT = (cropRect.top + dy).coerceIn(0f, cropRect.bottom - minSize)
                        cropRect.left = newL
                        cropRect.top = newT
                    }
                    HANDLE_TOP_RIGHT -> {
                        val newR = (cropRect.right + dx).coerceIn(cropRect.left + minSize, width.toFloat())
                        val newT = (cropRect.top + dy).coerceIn(0f, cropRect.bottom - minSize)
                        cropRect.right = newR
                        cropRect.top = newT
                    }
                    HANDLE_BOTTOM_LEFT -> {
                        val newL = (cropRect.left + dx).coerceIn(0f, cropRect.right - minSize)
                        val newB = (cropRect.bottom + dy).coerceIn(cropRect.top + minSize, height.toFloat())
                        cropRect.left = newL
                        cropRect.bottom = newB
                    }
                    HANDLE_BOTTOM_RIGHT -> {
                        val newR = (cropRect.right + dx).coerceIn(cropRect.left + minSize, width.toFloat())
                        val newB = (cropRect.bottom + dy).coerceIn(cropRect.top + minSize, height.toFloat())
                        cropRect.right = newR
                        cropRect.bottom = newB
                    }
                }
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activeHandle = HANDLE_NONE
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun getHitHandle(x: Float, y: Float): Int {
        if (abs(x - cropRect.left) < touchSlop && abs(y - cropRect.top) < touchSlop) return HANDLE_TOP_LEFT
        if (abs(x - cropRect.right) < touchSlop && abs(y - cropRect.top) < touchSlop) return HANDLE_TOP_RIGHT
        if (abs(x - cropRect.left) < touchSlop && abs(y - cropRect.bottom) < touchSlop) return HANDLE_BOTTOM_LEFT
        if (abs(x - cropRect.right) < touchSlop && abs(y - cropRect.bottom) < touchSlop) return HANDLE_BOTTOM_RIGHT
        if (cropRect.contains(x, y)) return HANDLE_CENTER
        return HANDLE_OUTSIDE
    }

    fun getCropRectInt(): Rect {
        return Rect(
            cropRect.left.toInt().coerceAtLeast(0),
            cropRect.top.toInt().coerceAtLeast(0),
            cropRect.right.toInt().coerceAtMost(width),
            cropRect.bottom.toInt().coerceAtMost(height)
        )
    }

    fun resetDefaultCrop() {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w > 0 && h > 0) {
            val rectW = w * 0.82f
            val rectH = h * 0.38f
            val left = (w - rectW) / 2f
            val top = (h - rectH) / 2f
            cropRect.set(left, top, left + rectW, top + rectH)
            invalidate()
        }
    }

    companion object {
        private const val HANDLE_NONE = 0
        private const val HANDLE_CENTER = 1
        private const val HANDLE_TOP_LEFT = 2
        private const val HANDLE_TOP_RIGHT = 3
        private const val HANDLE_BOTTOM_LEFT = 4
        private const val HANDLE_BOTTOM_RIGHT = 5
        private const val HANDLE_OUTSIDE = 6
    }
}
