package com.docuquick.app.ui

import android.animation.ValueAnimator
import android.content.Context
import android.util.AttributeSet
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import com.docuquick.app.R

/**
 * A rock-solid, mathematically clamped pinch-to-zoom container.
 * - Prevents black screens by strictly clamping scale between 1.0x and 3.5x.
 * - Prevents content from flying off-screen using strict edge boundary constraints.
 * - Only scales the active document view, leaving HUD controls and status pills fixed.
 * - Double-tap smoothly toggles between 1.0x and 2.0x.
 */
class ZoomableLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    var scaleFactor = 1.0f
        private set

    private val minScale = 1.0f   // Cannot pinch out below 100% (eliminates black borders/void)
    private val maxScale = 3.5f   // Safe upper limit for crisp rendering without GPU texture overflow

    private var translationXVal = 0f
    private var translationYVal = 0f

    private var onZoomChangeListener: ((Float) -> Unit)? = null

    fun setOnZoomChangeListener(listener: (Float) -> Unit) {
        onZoomChangeListener = listener
    }

    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            val factor = detector.scaleFactor
            val oldScale = scaleFactor
            val newScale = (scaleFactor * factor).coerceIn(minScale, maxScale)

            if (newScale != oldScale) {
                val focusX = detector.focusX
                val focusY = detector.focusY

                // Smooth focal-point scaling math
                val deltaScale = newScale / oldScale
                translationXVal = focusX - (focusX - translationXVal) * deltaScale
                translationYVal = focusY - (focusY - translationYVal) * deltaScale

                scaleFactor = newScale
                clampAndApplyTransform()
                onZoomChangeListener?.invoke(scaleFactor)
            }
            return true
        }
    })

    private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDoubleTap(e: MotionEvent): Boolean {
            if (scaleFactor > 1.05f) {
                resetZoom()
            } else {
                animateZoom(2.0f, e.x, e.y)
            }
            return true
        }

        override fun onScroll(
            e1: MotionEvent?,
            e2: MotionEvent,
            distanceX: Float,
            distanceY: Float
        ): Boolean {
            if (scaleFactor > 1.05f) {
                translationXVal -= distanceX
                translationYVal -= distanceY
                clampAndApplyTransform()
                return true
            }
            return false
        }
    })

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        // If WebView is visible (Presentations, EPUB, Rich Docs), let WebView handle gestures natively
        val activeWebView = findViewById<View>(R.id.epubWebView)
        if (activeWebView != null && activeWebView.visibility == View.VISIBLE) {
            return super.dispatchTouchEvent(ev)
        }

        // Multi-touch gestures are handled by scale detector
        scaleDetector.onTouchEvent(ev)
        gestureDetector.onTouchEvent(ev)

        // When zoomed in or pinching, lock touch to this container so parent doesn't steal touches
        if (ev.pointerCount > 1 || scaleFactor > 1.05f) {
            parent?.requestDisallowInterceptTouchEvent(true)
        } else {
            parent?.requestDisallowInterceptTouchEvent(false)
        }

        return super.dispatchTouchEvent(ev)
    }

    /**
     * Strictly clamps translations so the document content NEVER escapes the viewport edges.
     * Prevents black screen or lost content under all circumstances.
     */
    private fun clampAndApplyTransform() {
        if (scaleFactor <= 1.0f) {
            translationXVal = 0f
            translationYVal = 0f
            scaleFactor = 1.0f
        } else {
            val viewW = width.toFloat()
            val viewH = height.toFloat()

            val maxTransX = 0f
            val minTransX = viewW * (1.0f - scaleFactor)
            translationXVal = translationXVal.coerceIn(minTransX, maxTransX)

            val maxTransY = 0f
            val minTransY = viewH * (1.0f - scaleFactor)
            translationYVal = translationYVal.coerceIn(minTransY, maxTransY)
        }

        // Apply only to active document views (ignore HUD pills and dialog overlays)
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (isDocumentContentView(child) && child.visibility == View.VISIBLE) {
                child.pivotX = 0f
                child.pivotY = 0f
                child.scaleX = scaleFactor
                child.scaleY = scaleFactor
                child.translationX = translationXVal
                child.translationY = translationYVal
            }
        }
    }

    private fun isDocumentContentView(v: View): Boolean {
        return v.id == com.docuquick.app.R.id.pdfRecyclerView ||
               v.id == com.docuquick.app.R.id.textScrollView ||
               v.id == com.docuquick.app.R.id.tableHorizontalScrollView ||
               v.id == com.docuquick.app.R.id.docImageView ||
               v.id == com.docuquick.app.R.id.splitPdfRecyclerView ||
               v.id == com.docuquick.app.R.id.splitTextScrollView ||
               v.id == com.docuquick.app.R.id.splitDocImageView
    }

    fun animateZoom(targetScale: Float, focusX: Float, focusY: Float) {
        val startScale = scaleFactor
        val startTransX = translationXVal
        val startTransY = translationYVal

        val delta = targetScale / startScale
        val targetTransX = focusX - (focusX - startTransX) * delta
        val targetTransY = focusY - (focusY - startTransY) * delta

        ValueAnimator.ofFloat(0f, 1.0f).apply {
            duration = 240
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                val frac = anim.animatedFraction
                scaleFactor = startScale + (targetScale - startScale) * frac
                translationXVal = startTransX + (targetTransX - startTransX) * frac
                translationYVal = startTransY + (targetTransY - startTransY) * frac
                clampAndApplyTransform()
                onZoomChangeListener?.invoke(scaleFactor)
            }
            start()
        }
    }

    fun resetZoom() {
        if (scaleFactor == 1.0f && translationXVal == 0f && translationYVal == 0f) return

        val startScale = scaleFactor
        val startTransX = translationXVal
        val startTransY = translationYVal

        ValueAnimator.ofFloat(0f, 1.0f).apply {
            duration = 240
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                val frac = anim.animatedFraction
                scaleFactor = startScale + (1.0f - startScale) * frac
                translationXVal = startTransX * (1.0f - frac)
                translationYVal = startTransY * (1.0f - frac)
                clampAndApplyTransform()
                onZoomChangeListener?.invoke(scaleFactor)
            }
            start()
        }
    }
}
