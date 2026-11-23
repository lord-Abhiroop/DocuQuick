package com.docuquick.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

/**
 * PrivacyPeepShieldView - Anti-shoulder surfing privacy reading mask.
 * Darkens everything on screen except a draggable clear viewing aperture.
 */
class PrivacyPeepShieldView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val density = context.resources.displayMetrics.density
    var apertureHeight: Float = 130f * density
        set(value) {
            field = value.coerceIn(70f * density, 320f * density)
            invalidate()
        }

    private var apertureCenterY: Float = -1f
    private val cornerRadius: Float = 14f * density
    private val horizontalMargin: Float = 12f * density

    private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(238, 11, 15, 25) // 93% opaque dark slate
        style = Paint.Style.FILL
    }

    private val clearPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
    }

    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(190, 56, 189, 248) // subtle cyan/blue border
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
    }

    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(220, 255, 255, 255)
        style = Paint.Style.FILL
    }

    private val apertureRect = RectF()
    private val handleRect = RectF()

    var onDismissListener: (() -> Unit)? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (apertureCenterY < 0) {
            apertureCenterY = h / 2f
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width <= 0 || height <= 0) return

        // 1. Draw full dark privacy mask
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), maskPaint)

        // 2. Punch clear reading aperture
        val top = (apertureCenterY - apertureHeight / 2f).coerceAtLeast(0f)
        val bottom = (apertureCenterY + apertureHeight / 2f).coerceAtMost(height.toFloat())
        apertureRect.set(horizontalMargin, top, width.toFloat() - horizontalMargin, bottom)
        canvas.drawRoundRect(apertureRect, cornerRadius, cornerRadius, clearPaint)

        // 3. Draw border around the aperture
        canvas.drawRoundRect(apertureRect, cornerRadius, cornerRadius, borderPaint)

        // 4. Draw subtle drag handle pill on the right border
        val handleW = 4f * density
        val handleH = 32f * density
        val handleX = width.toFloat() - horizontalMargin - (6f * density)
        val handleY = apertureCenterY - (handleH / 2f)
        handleRect.set(handleX, handleY, handleX + handleW, handleY + handleH)
        canvas.drawRoundRect(handleRect, 2f * density, 2f * density, handlePaint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                apertureCenterY = event.y.coerceIn(apertureHeight / 2f, height.toFloat() - apertureHeight / 2f)
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    fun adjustAperture(deltaDp: Float) {
        apertureHeight += (deltaDp * density)
    }
}
