package com.docuquick.app

import android.annotation.SuppressLint
import android.app.Dialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.text.Editable
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.TextWatcher
import android.text.style.BackgroundColorSpan
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TableRow
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature
import com.docuquick.app.databinding.ActivityViewerBinding
import com.docuquick.app.model.DocumentType
import com.docuquick.app.model.RecentFile
import com.docuquick.app.parser.CodeHighlighter
import com.docuquick.app.parser.DocxParser
import com.docuquick.app.parser.EpubParser
import com.docuquick.app.parser.ExcelParser
import com.docuquick.app.parser.MarkdownParser
import com.docuquick.app.parser.PptxParser
import com.docuquick.app.parser.SheetData
import com.docuquick.app.ui.PdfAdapter
import com.docuquick.app.util.FileUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import android.content.Context
import android.os.CancellationSignal
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipInputStream

class ViewerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityViewerBinding
    private val app get() = application as DocuQuickApp

    private var documentUri: Uri? = null
    private var documentName: String = "Document"
    private var documentSizeBytes: Long = 0L
    private var documentType: DocumentType = DocumentType.UNKNOWN

    // PDF state
    private var tempPdfFile: File? = null
    private var pdfFileDescriptor: ParcelFileDescriptor? = null
    private var pdfRenderer: PdfRenderer? = null

    // Search state
    private val searchMatchIndices = mutableListOf<Int>()
    private var currentMatchIndex = -1
    private var originalSpannedText: CharSequence? = null

    // Text sizing
    private var baseTextSizeSp = 15f

    // Page jump & navigation state
    private var totalDocumentPages = 1
    private var currentActivePage = 1

    // Text-to-Speech state
    private var textToSpeech: TextToSpeech? = null
    private var isTtsSpeaking = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityViewerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        resolveIncomingIntent()
        setupToolbar()
        setupSearchPanel()
        setupActionButtons()
        setupPinchToZoom()

        documentUri?.let { uri ->
            loadDocument(uri)
        } ?: run {
            Toast.makeText(this, "No document specified", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        resolveIncomingIntent()
        documentUri?.let { uri ->
            setupToolbar()
            loadDocument(uri)
        }
    }

    override fun onPause() {
        super.onPause()
        if (isTtsSpeaking) {
            textToSpeech?.stop()
            isTtsSpeaking = false
            binding.btnReadAloud.setImageResource(R.drawable.ic_volume_up)
        }
        documentUri?.let { uri ->
            if (binding.epubWebView.visibility == View.VISIBLE) {
                app.prefs.saveDocumentScrollY(uri.toString(), binding.epubWebView.scrollY)
            } else if (binding.textScrollView.visibility == View.VISIBLE) {
                app.prefs.saveDocumentScrollY(uri.toString(), binding.textScrollView.scrollY)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        closePdfRenderer()
        try {
            binding.epubWebView.clearCache(true)
            binding.epubWebView.destroy()
            FileUtils.pruneCache(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun resolveIncomingIntent() {
        var uri: Uri? = null

        if (intent != null) {
            if (intent.action == Intent.ACTION_SEND) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
            }
            if (uri == null) {
                uri = intent.data
            }
            if (uri == null && intent.clipData != null && intent.clipData!!.itemCount > 0) {
                uri = intent.clipData!!.getItemAt(0).uri
            }
        }

        documentUri = uri
        if (uri != null) {
            val (name, size) = FileUtils.getFileMetadata(this, uri)
            documentName = name
            documentSizeBytes = size

            // Cache external temporary content URIs (e.g. WhatsApp, Telegram) in cacheDir
            // This ensures documents in Recents remain permanently accessible while strictly managing storage
            var effectiveUri = uri
            if (uri.scheme == "content") {
                val isInternal = uri.authority == "${packageName}.fileprovider"
                if (!isInternal) {
                    val took = try {
                        contentResolver.takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        )
                        true
                    } catch (e: Exception) {
                        false
                    }

                    if (!took) {
                        effectiveUri = FileUtils.cacheDocumentLocally(this, uri, name)
                        documentUri = effectiveUri
                    }
                }
            } else if (uri.scheme == "file") {
                effectiveUri = FileUtils.cacheDocumentLocally(this, uri, name)
                documentUri = effectiveUri
            }

            val mime = try { contentResolver.getType(uri) } catch (e: Exception) { null }
            var type = DocumentType.fromFileNameAndMime(name, mime)

            // If unknown (common when WhatsApp sends generic content without extension), inspect stream magic bytes
            if (type == DocumentType.UNKNOWN) {
                try {
                    contentResolver.openInputStream(effectiveUri)?.use { stream ->
                        type = DocumentType.detectFromStream(stream)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            documentType = type

            // Record cached permanent URI in Recents
            app.prefs.addRecentFile(
                RecentFile(
                    uriString = effectiveUri.toString(),
                    name = name,
                    sizeBytes = if (documentSizeBytes > 0) documentSizeBytes else size,
                    type = documentType,
                    lastOpened = System.currentTimeMillis()
                )
            )
        }
    }

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/doc/", object : WebViewAssetLoader.PathHandler {
                override fun handle(path: String): WebResourceResponse? {
                    val uri = documentUri ?: return null
                    return try {
                        val cleanPath = path.substringBefore('?').lowercase()
                        val ext = cleanPath.substringAfterLast('.', "").ifEmpty {
                            documentName.substringAfterLast('.', "").lowercase()
                        }
                        val stream = if (tempPdfFile?.exists() == true && (ext == "pdf" || cleanPath.endsWith(".pdf"))) {
                            FileInputStream(tempPdfFile)
                        } else {
                            contentResolver.openInputStream(uri)
                        } ?: return null
                        val mime = when (ext) {
                            "pdf" ->
                                "application/pdf"
                            "pptx", "ppsx", "pptm", "potx" ->
                                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            "ppt", "pps", "pot" ->
                                "application/vnd.ms-powerpoint"
                            "docx", "docm", "dotx" ->
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            "doc", "dot" ->
                                "application/msword"
                            "xlsx", "xlsm", "xlsb", "xltx" ->
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            "xls" ->
                                "application/vnd.ms-excel"
                            "csv" ->
                                "text/csv"
                            "tsv" ->
                                "text/tab-separated-values"
                            "odt", "ott", "fodt" ->
                                "application/vnd.oasis.opendocument.text"
                            "ods" ->
                                "application/vnd.oasis.opendocument.spreadsheet"
                            "rtf" ->
                                "application/rtf"
                            "epub" ->
                                "application/epub+zip"
                            "md", "markdown" ->
                                "text/markdown"
                            "txt", "log" ->
                                "text/plain"
                            "json" ->
                                "application/json"
                            "xml" ->
                                "application/xml"
                            else -> contentResolver.getType(uri) ?: "application/octet-stream"
                        }
                        val encoding = if (mime.startsWith("text/") || mime == "application/json" || mime == "application/xml") "UTF-8" else null
                        val headers = mapOf(
                            "Access-Control-Allow-Origin" to "*",
                            "Access-Control-Allow-Methods" to "GET, OPTIONS",
                            "Access-Control-Allow-Headers" to "*",
                            "X-Gander-Encoding" to "UTF-8"
                        )
                        WebResourceResponse(mime, encoding, 200, "OK", headers, stream)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        null
                    }
                }
            })
            .build()
    }

    private fun loadWebDocument(pageHtml: String, ext: String, label: String) {
        val isDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES || app.prefs.themeMode in listOf(2, 3)
        val nightParam = if (isDark) "1" else "0"
        val textScaleParam = (app.prefs.textSizeScale * 100).toInt()

        binding.loadingLayout.visibility = View.VISIBLE
        binding.pdfRecyclerView.visibility = View.GONE
        binding.docImageView.visibility = View.GONE
        binding.epubWebView.visibility = View.VISIBLE
        binding.statusPillCard.visibility = View.VISIBLE
        binding.txtStatusPill.text = label

        setupWebView()

        val encodedName = URLEncoder.encode(documentName, "UTF-8")
        val url = "https://appassets.androidplatform.net/assets/viewer/$pageHtml?name=$encodedName&ext=$ext&night=$nightParam&type=$textScaleParam"
        binding.epubWebView.loadUrl(url)
    }

    inner class PresentationBridge {
        @JavascriptInterface
        fun onSlideVisible(current: Int, total: Int) {
            runOnUiThread {
                binding.statusPillCard.visibility = View.VISIBLE
                currentActivePage = current
                totalDocumentPages = total
                documentUri?.let { app.prefs.saveDocumentPosition(it.toString(), current) }
                if (documentType == DocumentType.PPT) {
                    binding.txtStatusPill.text = "Slide $current of $total"
                } else {
                    binding.txtStatusPill.text = getString(R.string.page_counter, current, total)
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val isDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES || app.prefs.themeMode in listOf(2, 3)

        binding.epubWebView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = true
                builtInZoomControls = true
                displayZoomControls = false
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(true)
                textZoom = (app.prefs.textSizeScale * 100).toInt()
            }

            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                val forceDark = if (isDark) WebSettingsCompat.FORCE_DARK_ON else WebSettingsCompat.FORCE_DARK_OFF
                WebSettingsCompat.setForceDark(settings, forceDark)
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK_STRATEGY)) {
                WebSettingsCompat.setForceDarkStrategy(settings, WebSettingsCompat.DARK_STRATEGY_WEB_THEME_DARKENING_ONLY)
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }

            removeJavascriptInterface("DocuQuickBridge")
            addJavascriptInterface(PresentationBridge(), "DocuQuickBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    val path = request.url.path ?: return assetLoader.shouldInterceptRequest(request.url)
                    if (path.endsWith(".mjs")) {
                        return try {
                            val assetPath = path.removePrefix("/assets/")
                            val stream = assets.open(assetPath)
                            WebResourceResponse("text/javascript", "UTF-8", stream)
                        } catch (e: Exception) {
                            assetLoader.shouldInterceptRequest(request.url)
                        }
                    }
                    if (path.endsWith(".wasm")) {
                        return try {
                            val assetPath = path.removePrefix("/assets/")
                            val stream = assets.open(assetPath)
                            WebResourceResponse("application/wasm", null, stream)
                        } catch (e: Exception) {
                            assetLoader.shouldInterceptRequest(request.url)
                        }
                    }
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    binding.loadingLayout.visibility = View.GONE

                    documentUri?.let { uri ->
                        val savedY = app.prefs.getDocumentScrollY(uri.toString())
                        if (savedY > 0) {
                            view?.postDelayed({
                                view.scrollTo(0, savedY)
                            }, 350)
                        }
                    }

                    if (app.prefs.themeMode != 1) {
                        applyWebViewTheme(app.prefs.themeMode)
                    }

                    val trackingJs = """
                        (function() {
                            if (window._dqTrackingInstalled) return;
                            window._dqTrackingInstalled = true;
                            function checkSlide() {
                                var slides = document.querySelectorAll('#result .slide, #pages .pg');
                                if (!slides || slides.length === 0) return;
                                var atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 20);
                                if (atBottom && window.DocuQuickBridge) {
                                    window.DocuQuickBridge.onSlideVisible(slides.length, slides.length);
                                    return;
                                }
                                var mid = window.innerHeight * 0.45;
                                for (var i = 0; i < slides.length; i++) {
                                    var r = slides[i].getBoundingClientRect();
                                    if (r.top <= mid && r.bottom >= mid) {
                                        if (window.DocuQuickBridge) window.DocuQuickBridge.onSlideVisible(i + 1, slides.length);
                                        return;
                                    }
                                }
                                if (slides.length > 0 && window.DocuQuickBridge) {
                                    window.DocuQuickBridge.onSlideVisible(1, slides.length);
                                }
                            }
                            window.addEventListener('scroll', checkSlide, { passive: true });
                            var observer = new MutationObserver(checkSlide);
                            var res = document.getElementById('result');
                            if (res) observer.observe(res, { childList: true, subtree: true });
                            setTimeout(checkSlide, 600);
                            setTimeout(checkSlide, 1500);
                        })();
                    """.trimIndent()
                    view?.evaluateJavascript(trackingJs, null)
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    if (request?.isForMainFrame == true) {
                        showGenericError(error?.description?.toString() ?: "Failed to render document.")
                    }
                }
            }
        }
    }

    private fun setupPinchToZoom() {
        // Universal pinch-in / pinch-out zoom indicator and reset
        binding.contentContainer.setOnZoomChangeListener { scale ->
            if (scale > 1.05f) {
                binding.zoomPillCard.visibility = View.VISIBLE
                binding.txtZoomPill.text = "${(scale * 100).toInt()}% ⤢ Reset"
            } else {
                binding.zoomPillCard.visibility = View.GONE
            }
        }

        binding.zoomPillCard.setOnClickListener {
            binding.contentContainer.resetZoom()
        }
    }

    private fun setupToolbar() {
        binding.viewerToolbar.setNavigationOnClickListener {
            finish()
        }
        binding.txtDocTitle.text = documentName
        val sizeStr = FileUtils.formatFileSize(documentSizeBytes)
        binding.txtDocSubtitle.text = "${documentType.categoryName} • $sizeStr"
    }

    private fun setupActionButtons() {
        // Toggle Search
        binding.btnSearch.setOnClickListener {
            val isVisible = binding.searchPanel.visibility == View.VISIBLE
            binding.searchPanel.visibility = if (isVisible) View.GONE else View.VISIBLE
            if (!isVisible) {
                binding.editSearchQuery.requestFocus()
            } else {
                clearSearchHighlights()
            }
        }

        // Adjust Text Size
        binding.btnTextSize.setOnClickListener {
            showTextSizeDialog()
        }

        // Toggle Theme Mode
        binding.btnToggleTheme.setOnClickListener {
            toggleReadingTheme()
        }

        // Read Aloud (Offline TTS)
        binding.btnReadAloud.setOnClickListener {
            toggleReadAloud()
        }

        // Print & Save as Clean PDF
        binding.btnPrint.setOnClickListener {
            printOrSaveAsPdf()
        }

        // Quick Page Jump
        binding.statusPillCard.setOnClickListener {
            showJumpToPageDialog()
        }

        // Share File
        binding.btnShare.setOnClickListener {
            shareCurrentDocument()
        }

        // File Details on Subtitle Click
        binding.txtDocSubtitle.setOnClickListener {
            showFileInfoDialog()
        }
    }

    private fun loadDocument(uri: Uri) {
        binding.loadingLayout.visibility = View.VISIBLE
        hideAllContentViews()

        if (documentType == DocumentType.UNSUPPORTED) {
            showUnsupportedError()
            return
        }

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                when (documentType) {
                    DocumentType.PDF -> loadPdfDocument(uri)
                    DocumentType.WORD -> loadWordDocument(uri)
                    DocumentType.EXCEL -> loadSpreadsheetDocument(uri)
                    DocumentType.PPT -> loadPresentationDocument(uri)
                    DocumentType.MARKDOWN -> loadMarkdownDocument(uri)
                    DocumentType.TEXT -> loadTextDocument(uri)
                    DocumentType.CODE -> loadCodeDocument(uri)
                    DocumentType.EPUB -> loadEpubDocument(uri)
                    DocumentType.IMAGE -> loadImageDocument(uri)
                    DocumentType.UNKNOWN -> loadFallbackDocument(uri)
                    DocumentType.UNSUPPORTED -> {
                        withContext(Dispatchers.Main) {
                            showUnsupportedError()
                        }
                    }
                }
            } catch (t: Throwable) {
                withContext(Dispatchers.Main) {
                    showGenericError(t.localizedMessage ?: "File could not be parsed as a readable document.")
                }
            }
        }
    }

    private fun hideAllContentViews() {
        binding.pdfRecyclerView.visibility = View.GONE
        binding.textScrollView.visibility = View.GONE
        binding.tableHorizontalScrollView.visibility = View.GONE
        binding.epubWebView.visibility = View.GONE
        binding.docImageView.visibility = View.GONE
        binding.errorStateLayout.visibility = View.GONE
    }

    private fun showUnsupportedError() {
        binding.loadingLayout.visibility = View.GONE
        hideAllContentViews()
        binding.errorStateLayout.visibility = View.VISIBLE
        binding.statusPillCard.visibility = View.GONE
        binding.zoomPillCard.visibility = View.GONE

        val extension = documentName.substringAfterLast('.', "").uppercase().ifEmpty { "UNKNOWN" }
        val mime = documentUri?.let { contentResolver.getType(it) } ?: ""

        val isVideo = mime.startsWith("video/") || extension in listOf("MP4", "MKV", "AVI", "MOV", "WEBM", "3GP")
        val isAudio = mime.startsWith("audio/") || extension in listOf("MP3", "WAV", "AAC", "M4A", "FLAC", "OGG")

        val mediaType = when {
            isVideo -> "Video"
            isAudio -> "Audio"
            else -> "Media/Binary"
        }

        binding.txtErrorTitle.text = "Unsupported $mediaType File"
        binding.txtErrorMessage.text = "DocuQuick is optimized for reading documents (PDF, Word, Excel, Markdown, Text, EPUB, Code, and Images).\n\n\"$documentName\" is a $mediaType file ($extension) and cannot be displayed as a document."

        binding.btnErrorGoBack.setOnClickListener {
            finish()
        }

        binding.btnErrorOpenWith.setOnClickListener {
            openInOtherApp()
        }
    }

    private fun showGenericError(message: String) {
        binding.loadingLayout.visibility = View.GONE
        hideAllContentViews()
        binding.errorStateLayout.visibility = View.VISIBLE
        binding.statusPillCard.visibility = View.GONE
        binding.zoomPillCard.visibility = View.GONE

        binding.txtErrorTitle.text = "Cannot Preview Document"
        binding.txtErrorMessage.text = "DocuQuick could not open \"$documentName\":\n\n$message"

        binding.btnErrorGoBack.setOnClickListener {
            finish()
        }

        binding.btnErrorOpenWith.setOnClickListener {
            openInOtherApp()
        }
    }

    private fun openInOtherApp() {
        documentUri?.let { uri ->
            try {
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, contentResolver.getType(uri) ?: "*/*")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(intent, "Open with..."))
            } catch (e: Exception) {
                Toast.makeText(this, "No external app found to open this file", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // =========================================================================
    // 1. PDF Loader
    // =========================================================================
    private suspend fun loadPdfDocument(uri: Uri) {
        val temp = FileUtils.copyUriToTempFile(this@ViewerActivity, uri, "pdf_", ".pdf")
        tempPdfFile = temp
        val pfd = ParcelFileDescriptor.open(temp, ParcelFileDescriptor.MODE_READ_ONLY)
        pdfFileDescriptor = pfd
        try {
            val renderer = PdfRenderer(pfd)
            pdfRenderer = renderer

            withContext(Dispatchers.Main) {
                binding.loadingLayout.visibility = View.GONE
                binding.epubWebView.visibility = View.GONE
                binding.docImageView.visibility = View.GONE
                binding.pdfRecyclerView.visibility = View.VISIBLE

                val adapter = PdfAdapter(renderer, lifecycleScope)
                val layoutManager = LinearLayoutManager(this@ViewerActivity)
                binding.pdfRecyclerView.layoutManager = layoutManager
                binding.pdfRecyclerView.adapter = adapter

                totalDocumentPages = renderer.pageCount
                val savedPage = documentUri?.let { app.prefs.getDocumentPosition(it.toString()) } ?: 1
                currentActivePage = if (savedPage in 1..renderer.pageCount) savedPage else 1

                binding.txtStatusPill.text = getString(R.string.page_counter, currentActivePage, renderer.pageCount)

                if (currentActivePage > 1) {
                    binding.pdfRecyclerView.post {
                        layoutManager.scrollToPositionWithOffset(currentActivePage - 1, 0)
                    }
                    Toast.makeText(this@ViewerActivity, "Resumed at page $currentActivePage", Toast.LENGTH_SHORT).show()
                }

                binding.pdfRecyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
                    override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                        val totalPages = renderer.pageCount
                        if (totalPages <= 0) return

                        val activePage = when {
                            !recyclerView.canScrollVertically(1) -> totalPages
                            !recyclerView.canScrollVertically(-1) -> 1
                            else -> {
                                val centerY = recyclerView.height / 2f
                                val centerX = recyclerView.width / 2f
                                val centerChild = recyclerView.findChildViewUnder(centerX, centerY)
                                val centerPos = if (centerChild != null) {
                                    val pos = recyclerView.getChildAdapterPosition(centerChild)
                                    if (pos != RecyclerView.NO_POSITION) pos + 1 else null
                                } else null

                                centerPos ?: run {
                                    var maxVisibleHeight = 0
                                    var bestPos = layoutManager.findFirstVisibleItemPosition()
                                    for (i in 0 until recyclerView.childCount) {
                                        val child = recyclerView.getChildAt(i)
                                        val top = child.top.coerceAtLeast(0)
                                        val bottom = child.bottom.coerceAtMost(recyclerView.height)
                                        val visibleHeight = (bottom - top).coerceAtLeast(0)
                                        if (visibleHeight > maxVisibleHeight) {
                                            maxVisibleHeight = visibleHeight
                                            val pos = recyclerView.getChildAdapterPosition(child)
                                            if (pos != RecyclerView.NO_POSITION) {
                                                bestPos = pos
                                            }
                                        }
                                    }
                                    if (bestPos != RecyclerView.NO_POSITION) bestPos + 1 else 1
                                }
                            }
                        }

                        currentActivePage = activePage
                        totalDocumentPages = totalPages
                        binding.txtStatusPill.text = getString(R.string.page_counter, activePage, totalPages)
                        documentUri?.let { app.prefs.saveDocumentPosition(it.toString(), activePage) }
                    }
                })
            }
        } catch (e: SecurityException) {
            // Password-protected PDF detected! Switch to web viewer with floating unlock bar
            try {
                pfd.close()
            } catch (ignored: Exception) {}
            pdfFileDescriptor = null
            pdfRenderer = null
            withContext(Dispatchers.Main) {
                loadWebDocument("pdf.html", "pdf", "Protected PDF")
            }
        } catch (e: Exception) {
            if (e.message?.contains("password", ignoreCase = true) == true) {
                try {
                    pfd.close()
                } catch (ignored: Exception) {}
                pdfFileDescriptor = null
                pdfRenderer = null
                withContext(Dispatchers.Main) {
                    loadWebDocument("pdf.html", "pdf", "Protected PDF")
                }
            } else {
                throw e
            }
        }
    }

    // =========================================================================
    // 2. Microsoft Word & Rich Text (DOCX, DOC, ODT, RTF) Loader
    // =========================================================================
    private suspend fun loadWordDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "docx" }
        withContext(Dispatchers.Main) {
            if (extension in listOf("doc", "dot", "odt", "ott", "fodt", "rtf")) {
                loadWebDocument("prose.html", extension, "Document")
            } else {
                loadWebDocument("docx.html", extension, "Word Document")
            }
        }
    }

    // =========================================================================
    // 3. Spreadsheet (XLSX, XLS, CSV, TSV, ODS) Loader
    // =========================================================================
    private suspend fun loadSpreadsheetDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "xlsx" }
        withContext(Dispatchers.Main) {
            val label = when (extension) {
                "csv", "tsv" -> "CSV Spreadsheet"
                "ods" -> "OpenDocument Sheet"
                else -> "Excel Spreadsheet"
            }
            loadWebDocument("xlsx.html", extension, label)
        }
    }

    // =========================================================================
    // 4. PowerPoint Presentation (PPTX, PPT) Loader
    // =========================================================================
    private suspend fun loadPresentationDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "pptx" }

        // Count slides quickly from zip entries in background IO
        val slideCount = withContext(Dispatchers.IO) {
            try {
                contentResolver.openInputStream(uri)?.use { stream ->
                    var count = 0
                    ZipInputStream(stream).use { zis ->
                        var entry = zis.nextEntry
                        while (entry != null) {
                            if (entry.name.startsWith("ppt/slides/slide") && entry.name.endsWith(".xml")) {
                                count++
                            }
                            entry = zis.nextEntry
                        }
                    }
                    count
                } ?: 0
            } catch (e: Exception) {
                0
            }
        }

        withContext(Dispatchers.Main) {
            val label = if (slideCount > 0) "$slideCount Slides • Presentation" else "Presentation"
            loadWebDocument("pptx.html", extension, label)
        }
    }

    // =========================================================================
    // 5. Markdown Loader
    // =========================================================================
    private suspend fun loadMarkdownDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "md" }
        withContext(Dispatchers.Main) {
            loadWebDocument("md.html", extension, "Markdown Document")
        }
    }

    // =========================================================================
    // 6. Text & Code Loader
    // =========================================================================
    private suspend fun loadTextDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "txt" }
        withContext(Dispatchers.Main) {
            loadWebDocument("text.html", extension, "Text Document")
        }
    }

    private suspend fun loadCodeDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase().ifEmpty { "txt" }
        withContext(Dispatchers.Main) {
            loadWebDocument("text.html", extension, "${extension.uppercase()} File")
        }
    }

    // =========================================================================
    // 7. EPUB E-Book Loader
    // =========================================================================
    private suspend fun loadEpubDocument(uri: Uri) {
        withContext(Dispatchers.Main) {
            loadWebDocument("epub.html", "epub", "EPUB Book")
        }
    }

    // =========================================================================
    // 7. Image Loader
    // =========================================================================
    private suspend fun loadImageDocument(uri: Uri) {
        val bitmap = contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream)
        }

        withContext(Dispatchers.Main) {
            binding.loadingLayout.visibility = View.GONE
            binding.docImageView.visibility = View.VISIBLE
            bitmap?.let {
                binding.docImageView.setImageBitmap(it)
                binding.txtStatusPill.text = "${it.width} × ${it.height} px"
            } ?: run {
                Toast.makeText(this@ViewerActivity, "Unable to load image", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private suspend fun loadFallbackDocument(uri: Uri) {
        loadTextDocument(uri)
    }

    private fun displayTextContent(ssb: CharSequence, typeLabel: String) {
        originalSpannedText = ssb
        binding.loadingLayout.visibility = View.GONE
        binding.textScrollView.visibility = View.VISIBLE

        binding.contentTextView.textSize = baseTextSizeSp * app.prefs.textSizeScale
        binding.contentTextView.text = ssb

        val words = ssb.split(Regex("\\s+")).count { it.isNotBlank() }
        val readTimeMinutes = (words / 200).coerceAtLeast(1)
        binding.txtStatusPill.text = getString(R.string.word_count, words, "$readTimeMinutes min")

        val savedY = documentUri?.let { app.prefs.getDocumentScrollY(it.toString()) } ?: 0
        if (savedY > 0) {
            binding.textScrollView.post {
                binding.textScrollView.scrollTo(0, savedY)
            }
        }
    }

    // =========================================================================
    // 8. In-Document Search Implementation
    // =========================================================================
    private fun setupSearchPanel() {
        binding.epubWebView.setFindListener { activeMatchOrdinal, numberOfMatches, _ ->
            if (binding.epubWebView.visibility == View.VISIBLE) {
                if (numberOfMatches > 0) {
                    binding.txtSearchCount.text = getString(
                        R.string.search_matches,
                        activeMatchOrdinal + 1,
                        numberOfMatches
                    )
                } else {
                    binding.txtSearchCount.text = getString(R.string.no_matches)
                }
            }
        }

        binding.btnCloseSearch.setOnClickListener {
            binding.searchPanel.visibility = View.GONE
            clearSearchHighlights()
        }

        binding.editSearchQuery.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                performSearch(s?.toString() ?: "")
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.btnSearchNext.setOnClickListener {
            if (binding.epubWebView.visibility == View.VISIBLE) {
                binding.epubWebView.findNext(true)
            } else if (searchMatchIndices.isNotEmpty()) {
                currentMatchIndex = (currentMatchIndex + 1) % searchMatchIndices.size
                updateSearchIndicator()
                scrollToCurrentMatch()
            }
        }

        binding.btnSearchPrev.setOnClickListener {
            if (binding.epubWebView.visibility == View.VISIBLE) {
                binding.epubWebView.findNext(false)
            } else if (searchMatchIndices.isNotEmpty()) {
                currentMatchIndex = if (currentMatchIndex - 1 < 0) searchMatchIndices.size - 1 else currentMatchIndex - 1
                updateSearchIndicator()
                scrollToCurrentMatch()
            }
        }
    }

    private fun performSearch(query: String) {
        if (binding.epubWebView.visibility == View.VISIBLE) {
            if (query.isBlank()) {
                binding.txtSearchCount.text = ""
                binding.epubWebView.clearMatches()
            } else {
                binding.epubWebView.findAllAsync(query)
            }
            return
        }

        searchMatchIndices.clear()
        currentMatchIndex = -1

        val currentText = originalSpannedText ?: binding.contentTextView.text
        if (query.isBlank() || currentText.isEmpty()) {
            binding.txtSearchCount.text = ""
            clearSearchHighlights()
            return
        }

        val ssb = SpannableStringBuilder(currentText)
        val textStr = currentText.toString()
        var index = textStr.indexOf(query, 0, ignoreCase = true)

        while (index != -1) {
            searchMatchIndices.add(index)
            ssb.setSpan(
                BackgroundColorSpan(Color.parseColor("#FEF08A")),
                index,
                index + query.length,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
            index = textStr.indexOf(query, index + query.length, ignoreCase = true)
        }

        binding.contentTextView.text = ssb

        if (searchMatchIndices.isNotEmpty()) {
            currentMatchIndex = 0
            updateSearchIndicator()
            scrollToCurrentMatch()
        } else {
            binding.txtSearchCount.text = getString(R.string.no_matches)
        }
    }

    private fun updateSearchIndicator() {
        if (searchMatchIndices.isNotEmpty()) {
            binding.txtSearchCount.text = getString(
                R.string.search_matches,
                currentMatchIndex + 1,
                searchMatchIndices.size
            )
        }
    }

    private fun scrollToCurrentMatch() {
        if (currentMatchIndex in searchMatchIndices.indices) {
            val charIndex = searchMatchIndices[currentMatchIndex]
            val layout = binding.contentTextView.layout
            if (layout != null) {
                val line = layout.getLineForOffset(charIndex)
                val y = layout.getLineTop(line)
                binding.textScrollView.smoothScrollTo(0, y)
            }
        }
    }

    private fun clearSearchHighlights() {
        if (binding.epubWebView.visibility == View.VISIBLE) {
            binding.epubWebView.clearMatches()
        }
        originalSpannedText?.let {
            binding.contentTextView.text = it
        }
        binding.txtSearchCount.text = ""
    }

    // =========================================================================
    // 9. Reading Theme & Text Size Features
    // =========================================================================
    private fun showTextSizeDialog() {
        val currentScale = app.prefs.textSizeScale
        val dialog = Dialog(this)
        dialog.setContentView(R.layout.dialog_file_info)

        val title = dialog.findViewById<TextView>(R.id.dialogTitle)
        val content = dialog.findViewById<TextView>(R.id.txtDialogContent)
        title.text = getString(R.string.action_text_size)

        content.text = "Current Scale: ${(currentScale * 100).toInt()}%\n\nTap to cycle text size:\n• Small (85%)\n• Normal (100%)\n• Large (125%)\n• Extra Large (150%)"

        content.setOnClickListener {
            val newScale = when {
                currentScale < 1.0f -> 1.0f
                currentScale == 1.0f -> 1.25f
                currentScale == 1.25f -> 1.50f
                else -> 0.85f
            }
            app.prefs.textSizeScale = newScale
            binding.contentTextView.textSize = baseTextSizeSp * newScale
            if (binding.epubWebView.visibility == View.VISIBLE) {
                binding.epubWebView.settings.textZoom = (newScale * 100).toInt()
            }
            dialog.dismiss()
        }
        dialog.show()
    }

    private fun toggleReadingTheme() {
        // 4-stage eye-care reading tint cycle: Light (1) -> Sepia (2) -> Slate Dark (3) -> AMOLED Black (4) -> Light (1)
        val nextMode = when (app.prefs.themeMode) {
            1 -> 2
            2 -> 3
            3 -> 4
            else -> 1
        }
        app.prefs.themeMode = nextMode
        applyReadingTheme(nextMode)
    }

    private fun applyReadingTheme(mode: Int) {
        when (mode) {
            2 -> { // Warm Sepia (Eye-Care Tint)
                binding.viewerRootLayout.setBackgroundColor(Color.parseColor("#FBF0D9"))
                binding.contentTextView.setTextColor(Color.parseColor("#433422"))
                applyWebViewTheme(mode)
                Toast.makeText(this, "Warm Sepia (Eye-Care)", Toast.LENGTH_SHORT).show()
            }
            3 -> { // Slate Dark
                binding.viewerRootLayout.setBackgroundColor(Color.parseColor("#0F172A"))
                binding.contentTextView.setTextColor(Color.parseColor("#E2E8F0"))
                applyWebViewTheme(mode)
                Toast.makeText(this, "Slate Dark", Toast.LENGTH_SHORT).show()
            }
            4 -> { // AMOLED Black
                binding.viewerRootLayout.setBackgroundColor(Color.parseColor("#000000"))
                binding.contentTextView.setTextColor(Color.parseColor("#E2E8F0"))
                applyWebViewTheme(mode)
                Toast.makeText(this, "AMOLED Black", Toast.LENGTH_SHORT).show()
            }
            else -> { // Clean Light (1)
                binding.viewerRootLayout.setBackgroundColor(ContextCompat.getColor(this, R.color.background_light))
                binding.contentTextView.setTextColor(ContextCompat.getColor(this, R.color.text_primary_light))
                applyWebViewTheme(mode)
                Toast.makeText(this, "Clean Light", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun applyWebViewTheme(mode: Int) {
        if (binding.epubWebView.visibility == View.VISIBLE) {
            val isDark = mode in listOf(3, 4)
            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                val forceDark = if (isDark) WebSettingsCompat.FORCE_DARK_ON else WebSettingsCompat.FORCE_DARK_OFF
                WebSettingsCompat.setForceDark(binding.epubWebView.settings, forceDark)
            }
            val js = when (mode) {
                2 -> """
                    (function() {
                        var style = document.getElementById('dq-theme-override') || document.createElement('style');
                        style.id = 'dq-theme-override';
                        style.textContent = 'html, body { background-color: #FBF0D9 !important; color: #433422 !important; } * { color: #433422 !important; }';
                        if (!style.parentNode) document.head.appendChild(style);
                        if (typeof vwSetNight === 'function') vwSetNight(false);
                    })();
                """.trimIndent()
                3 -> """
                    (function() {
                        var style = document.getElementById('dq-theme-override') || document.createElement('style');
                        style.id = 'dq-theme-override';
                        style.textContent = 'html, body { background-color: #0F172A !important; color: #E2E8F0 !important; }';
                        if (!style.parentNode) document.head.appendChild(style);
                        if (typeof vwSetNight === 'function') vwSetNight(true);
                    })();
                """.trimIndent()
                4 -> """
                    (function() {
                        var style = document.getElementById('dq-theme-override') || document.createElement('style');
                        style.id = 'dq-theme-override';
                        style.textContent = 'html, body { background-color: #000000 !important; color: #E2E8F0 !important; }';
                        if (!style.parentNode) document.head.appendChild(style);
                        if (typeof vwSetNight === 'function') vwSetNight(true);
                    })();
                """.trimIndent()
                else -> """
                    (function() {
                        var style = document.getElementById('dq-theme-override');
                        if (style) style.remove();
                        if (typeof vwSetNight === 'function') vwSetNight(false);
                    })();
                """.trimIndent()
            }
            binding.epubWebView.evaluateJavascript(js, null)
        }
    }

    // =========================================================================
    // Jump to Page / Slide Dialog
    // =========================================================================
    private fun showJumpToPageDialog() {
        if (totalDocumentPages <= 1 && binding.textScrollView.visibility != View.VISIBLE) {
            Toast.makeText(this, "Single page document", Toast.LENGTH_SHORT).show()
            return
        }

        if (binding.textScrollView.visibility == View.VISIBLE) {
            AlertDialog.Builder(this)
                .setTitle("Quick Scroll")
                .setItems(arrayOf("Scroll to Top", "Scroll to Middle", "Scroll to Bottom")) { _, which ->
                    when (which) {
                        0 -> binding.textScrollView.smoothScrollTo(0, 0)
                        1 -> binding.textScrollView.smoothScrollTo(0, binding.contentTextView.height / 2)
                        2 -> binding.textScrollView.smoothScrollTo(0, binding.contentTextView.height)
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
            return
        }

        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "1 - $totalDocumentPages"
            setText(currentActivePage.toString())
            selectAll()
            setPadding(50, 40, 50, 40)
        }

        val title = if (documentType == DocumentType.PPT) "Jump to Slide" else "Jump to Page"

        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage("Enter number (1 to $totalDocumentPages):")
            .setView(input)
            .setPositiveButton("Go") { _, _ ->
                val pageNum = input.text.toString().toIntOrNull()
                if (pageNum != null && pageNum in 1..totalDocumentPages) {
                    currentActivePage = pageNum
                    if (binding.pdfRecyclerView.visibility == View.VISIBLE) {
                        (binding.pdfRecyclerView.layoutManager as? LinearLayoutManager)
                            ?.scrollToPositionWithOffset(pageNum - 1, 0)
                        binding.txtStatusPill.text = getString(R.string.page_counter, pageNum, totalDocumentPages)
                    } else if (binding.epubWebView.visibility == View.VISIBLE) {
                        val jumpJs = """
                            (function() {
                                var slides = document.querySelectorAll('#result .slide, #pages .pg');
                                if (slides && slides.length >= $pageNum) {
                                    slides[${pageNum - 1}].scrollIntoView({ behavior: 'smooth', block: 'start' });
                                } else {
                                    var targetY = (document.documentElement.scrollHeight / $totalDocumentPages) * (${pageNum - 1});
                                    window.scrollTo({ top: targetY, behavior: 'smooth' });
                                }
                            })();
                        """.trimIndent()
                        binding.epubWebView.evaluateJavascript(jumpJs, null)
                    }
                } else {
                    Toast.makeText(this, "Invalid page number (1 - $totalDocumentPages)", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // Native Offline Text-to-Speech (Read Aloud)
    // =========================================================================
    private fun initTtsIfNeeded(onReady: () -> Unit) {
        if (textToSpeech == null) {
            textToSpeech = TextToSpeech(applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    textToSpeech?.language = Locale.getDefault()
                    onReady()
                } else {
                    Toast.makeText(this, "Text-to-Speech not available on device", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            onReady()
        }
    }

    private fun toggleReadAloud() {
        if (isTtsSpeaking) {
            stopReadAloud()
            return
        }

        initTtsIfNeeded {
            if (binding.contentTextView.visibility == View.VISIBLE) {
                val text = binding.contentTextView.text?.toString() ?: ""
                if (text.isNotBlank()) {
                    startSpeaking(text)
                } else {
                    Toast.makeText(this, "No text to read", Toast.LENGTH_SHORT).show()
                }
            } else if (binding.epubWebView.visibility == View.VISIBLE) {
                binding.epubWebView.evaluateJavascript("(function(){ return document.body.innerText || ''; })();") { raw ->
                    val text = unescapeJsString(raw)
                    if (text.isNotBlank()) {
                        runOnUiThread { startSpeaking(text) }
                    } else {
                        runOnUiThread { Toast.makeText(this, "No text found to read", Toast.LENGTH_SHORT).show() }
                    }
                }
            } else {
                Toast.makeText(this, "Read aloud is available for Word, EPUB, Text, Markdown and Code", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startSpeaking(text: String) {
        val clean = text.replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return

        isTtsSpeaking = true
        binding.btnReadAloud.setImageResource(R.drawable.ic_volume_off)
        Toast.makeText(this, "Reading aloud...", Toast.LENGTH_SHORT).show()

        val chunks = clean.chunked(3000)
        var isFirst = true
        for (chunk in chunks) {
            val queueMode = if (isFirst) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            textToSpeech?.speak(chunk, queueMode, null, "DocuQuickTTS")
            isFirst = false
        }

        textToSpeech?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                runOnUiThread { stopReadAloud() }
            }
            override fun onError(utteranceId: String?) {
                runOnUiThread { stopReadAloud() }
            }
        })
    }

    private fun stopReadAloud() {
        textToSpeech?.stop()
        isTtsSpeaking = false
        binding.btnReadAloud.setImageResource(R.drawable.ic_volume_up)
    }

    private fun unescapeJsString(raw: String?): String {
        if (raw.isNullOrBlank() || raw == "null" || raw == "\"\"") return ""
        return try {
            org.json.JSONTokener(raw).nextValue().toString()
        } catch (e: Exception) {
            raw.removeSurrounding("\"")
        }
    }

    // =========================================================================
    // Universal Print & Save as Clean PDF
    // =========================================================================
    private fun printOrSaveAsPdf() {
        val printManager = getSystemService(Context.PRINT_SERVICE) as? PrintManager
        if (printManager == null) {
            Toast.makeText(this, "Printing service unavailable", Toast.LENGTH_SHORT).show()
            return
        }

        val jobName = "DocuQuick - ${documentName.ifBlank { "Document" }}"

        if (binding.epubWebView.visibility == View.VISIBLE) {
            val printAdapter = binding.epubWebView.createPrintDocumentAdapter(jobName)
            printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
        } else if (tempPdfFile != null && tempPdfFile!!.exists()) {
            val fileToPrint = tempPdfFile!!
            val printAdapter = object : PrintDocumentAdapter() {
                override fun onLayout(
                    oldAttributes: PrintAttributes?,
                    newAttributes: PrintAttributes?,
                    cancellationSignal: CancellationSignal?,
                    callback: LayoutResultCallback?,
                    extras: Bundle?
                ) {
                    if (cancellationSignal?.isCanceled == true) {
                        callback?.onLayoutCancelled()
                        return
                    }
                    val pdi = PrintDocumentInfo.Builder(jobName)
                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .setPageCount(totalDocumentPages)
                        .build()
                    callback?.onLayoutFinished(pdi, true)
                }

                override fun onWrite(
                    pages: Array<out PageRange>?,
                    destination: ParcelFileDescriptor?,
                    cancellationSignal: CancellationSignal?,
                    callback: WriteResultCallback?
                ) {
                    try {
                        val input = FileInputStream(fileToPrint)
                        val output = FileOutputStream(destination?.fileDescriptor)
                        input.copyTo(output)
                        input.close()
                        output.close()
                        callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                    } catch (e: Exception) {
                        callback?.onWriteFailed(e.message)
                    }
                }
            }
            printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
        } else if (binding.contentTextView.visibility == View.VISIBLE) {
            val htmlContent = "<html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'><style>body { font-family: sans-serif; padding: 16px; font-size: 14px; line-height: 1.6; color: #000; }</style></head><body><pre style='white-space: pre-wrap; word-wrap: break-word;'>" +
                    android.text.TextUtils.htmlEncode(binding.contentTextView.text.toString()) +
                    "</pre></body></html>"
            val tempWebView = WebView(this)
            tempWebView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    val printAdapter = tempWebView.createPrintDocumentAdapter(jobName)
                    printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
                }
            }
            tempWebView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
        } else {
            Toast.makeText(this, "Printing not supported for this view", Toast.LENGTH_SHORT).show()
        }
    }

    private fun shareCurrentDocument() {
        documentUri?.let { uri ->
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = contentResolver.getType(uri) ?: "*/*"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, "Share Document"))
        }
    }

    private fun showFileInfoDialog() {
        val dialog = Dialog(this)
        dialog.setContentView(R.layout.dialog_file_info)

        val title = dialog.findViewById<TextView>(R.id.dialogTitle)
        val content = dialog.findViewById<TextView>(R.id.txtDialogContent)

        title.text = getString(R.string.action_info)
        val mime = documentUri?.let { contentResolver.getType(it) } ?: "Unknown"
        val dateStr = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault()).format(Date())

        content.text = """
            File Name:
            $documentName
            
            File Size:
            ${FileUtils.formatFileSize(documentSizeBytes)} ($documentSizeBytes bytes)
            
            Document Type:
            ${documentType.categoryName}
            
            MIME Type:
            $mime
            
            Opened:
            $dateStr

            ───────────────────────
            App Creator:
            Abhiroop Ghosh

            “Life eventually gets better when obstacles become the only correct path”
        """.trimIndent()

        dialog.show()
    }

    private fun closePdfRenderer() {
        try {
            pdfRenderer?.close()
            pdfFileDescriptor?.close()
            tempPdfFile?.delete()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
