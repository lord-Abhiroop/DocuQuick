package com.docuquick.app.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.util.LruCache
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.RecyclerView
import com.docuquick.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PdfAdapter(
    private val renderer: PdfRenderer,
    private val scope: CoroutineScope
) : RecyclerView.Adapter<PdfAdapter.PdfPageViewHolder>() {

    private val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
    private val cacheSize = maxMemory / 8 // 1/8th of available memory for cache
    private val bitmapCache = object : LruCache<Int, Bitmap>(cacheSize) {
        override fun sizeOf(key: Int, value: Bitmap): Int {
            return value.byteCount / 1024
        }
    }

    override fun getItemCount(): Int = renderer.pageCount

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PdfPageViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_pdf_page, parent, false)
        return PdfPageViewHolder(view)
    }

    override fun onBindViewHolder(holder: PdfPageViewHolder, position: Int) {
        holder.bind(position)
    }

    override fun onViewRecycled(holder: PdfPageViewHolder) {
        super.onViewRecycled(holder)
        holder.cancelRender()
    }

    inner class PdfPageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val imgPage: ImageView = itemView.findViewById(R.id.imgPdfPage)
        private var renderJob: Job? = null

        fun bind(position: Int) {
            cancelRender()

            val cached = bitmapCache.get(position)
            if (cached != null) {
                imgPage.setImageBitmap(cached)
                return
            }

            imgPage.setImageBitmap(null)

            renderJob = scope.launch(Dispatchers.Default) {
                val bitmap = renderPage(position)
                withContext(Dispatchers.Main) {
                    bitmap?.let {
                        bitmapCache.put(position, it)
                        imgPage.setImageBitmap(it)
                    }
                }
            }
        }

        fun cancelRender() {
            renderJob?.cancel()
            renderJob = null
        }

        private fun renderPage(pageIndex: Int): Bitmap? {
            return try {
                synchronized(renderer) {
                    renderer.openPage(pageIndex).use { page ->
                        // Universal hardware-adaptive scaling for razor-sharp text on any screen
                        val metrics = itemView.context.resources.displayMetrics
                        val screenWidthPx = metrics.widthPixels
                        val densityScale = metrics.density * 1.25f
                        val widthScale = if (page.width > 0) screenWidthPx.toFloat() / page.width.toFloat() else densityScale
                        val baseScale = maxOf(widthScale, densityScale).coerceIn(2.5f, 4.0f)

                        // Guard against oversized texture limits (e.g., architectural blueprints)
                        val maxDimension = 4096
                        val targetWidth = (page.width * baseScale).toInt()
                        val targetHeight = (page.height * baseScale).toInt()
                        val finalScale = if (targetWidth > maxDimension || targetHeight > maxDimension) {
                            minOf(maxDimension.toFloat() / page.width, maxDimension.toFloat() / page.height)
                        } else {
                            baseScale
                        }

                        val width = (page.width * finalScale).toInt().coerceAtLeast(1)
                        val height = (page.height * finalScale).toInt().coerceAtLeast(1)
                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bitmap
                    }
                }
            } catch (e: Exception) {
                null
            }
        }
    }
}
