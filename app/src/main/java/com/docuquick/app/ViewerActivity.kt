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
import androidx.webkit.WebViewAssetLoader
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

    override fun onDestroy() {
        super.onDestroy()
        closePdfRenderer()
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

            // Cache incoming content URIs locally to private storage
            // This ensures documents in Recents remain permanently accessible across reboots with zero crashes
            var effectiveUri = uri
            if (uri.scheme == "content") {
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
                        val stream = contentResolver.openInputStream(uri) ?: return null
                        val mime = when {
                            path.endsWith(".pptx", ignoreCase = true) -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            path.endsWith(".docx", ignoreCase = true) -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            path.endsWith(".xlsx", ignoreCase = true) -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            else -> contentResolver.getType(uri) ?: "application/octet-stream"
                        }
                        val headers = mapOf(
                            "Access-Control-Allow-Origin" to "*",
                            "Access-Control-Allow-Methods" to "GET, OPTIONS",
                            "Access-Control-Allow-Headers" to "*"
                        )
                        WebResourceResponse(mime, null, 200, "OK", headers, stream)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        null
                    }
                }
            })
            .build()
    }

    inner class PresentationBridge {
        @JavascriptInterface
        fun onSlideVisible(current: Int, total: Int) {
            runOnUiThread {
                binding.statusPillCard.visibility = View.VISIBLE
                binding.txtStatusPill.text = "Slide $current of $total"
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
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
            }
            removeJavascriptInterface("DocuQuickBridge")
            addJavascriptInterface(PresentationBridge(), "DocuQuickBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    binding.loadingLayout.visibility = View.GONE

                    val trackingJs = """
                        (function() {
                            if (window._dqTrackingInstalled) return;
                            window._dqTrackingInstalled = true;
                            function checkSlide() {
                                var slides = document.querySelectorAll('#result .slide');
                                if (!slides || slides.length === 0) return;
                                var mid = window.innerHeight * 0.4;
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
        val renderer = PdfRenderer(pfd)
        pdfRenderer = renderer

        withContext(Dispatchers.Main) {
            binding.loadingLayout.visibility = View.GONE
            binding.pdfRecyclerView.visibility = View.VISIBLE

            val adapter = PdfAdapter(renderer, lifecycleScope)
            val layoutManager = LinearLayoutManager(this@ViewerActivity)
            binding.pdfRecyclerView.layoutManager = layoutManager
            binding.pdfRecyclerView.adapter = adapter

            binding.txtStatusPill.text = getString(R.string.page_counter, 1, renderer.pageCount)

            binding.pdfRecyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    val firstPos = layoutManager.findFirstVisibleItemPosition()
                    if (firstPos != RecyclerView.NO_POSITION) {
                        binding.txtStatusPill.text = getString(R.string.page_counter, firstPos + 1, renderer.pageCount)
                    }
                }
            })
        }
    }

    // =========================================================================
    // 2. Microsoft Word (DOCX) Loader
    // =========================================================================
    private suspend fun loadWordDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase()
        if (extension == "docx") {
            withContext(Dispatchers.Main) {
                binding.loadingLayout.visibility = View.VISIBLE
                binding.epubWebView.visibility = View.VISIBLE
                binding.statusPillCard.visibility = View.VISIBLE
                binding.txtStatusPill.text = "Word Document"
                setupWebView()
                val encodedName = URLEncoder.encode(documentName, "UTF-8")
                val url = "https://appassets.androidplatform.net/assets/viewer/docx.html?name=$encodedName&ext=docx"
                binding.epubWebView.loadUrl(url)
            }
        } else {
            val ssb = contentResolver.openInputStream(uri)?.use { stream ->
                DocxParser.parseDocx(stream)
            } ?: SpannableStringBuilder("Unable to read Word document.")

            withContext(Dispatchers.Main) {
                displayTextContent(ssb, "Word Document")
            }
        }
    }

    // =========================================================================
    // 3. Spreadsheet (XLSX, CSV) Loader
    // =========================================================================
    private suspend fun loadSpreadsheetDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase()
        val sheetData: SheetData = contentResolver.openInputStream(uri)?.use { stream ->
            if (extension in listOf("csv", "tsv")) {
                ExcelParser.parseCsv(stream)
            } else {
                ExcelParser.parseXlsx(stream)
            }
        } ?: SheetData("Sheet", emptyList(), emptyList())

        withContext(Dispatchers.Main) {
            binding.loadingLayout.visibility = View.GONE
            binding.tableHorizontalScrollView.visibility = View.VISIBLE
            populateTableView(sheetData)
            binding.txtStatusPill.text = getString(R.string.sheet_rows, sheetData.rows.size, sheetData.headers.size)
        }
    }

    // =========================================================================
    // 4. PowerPoint Presentation (PPTX, PPT) Loader
    // =========================================================================
    private suspend fun loadPresentationDocument(uri: Uri) {
        val extension = documentName.substringAfterLast('.', "").lowercase()
        val isPptx = (extension == "pptx" || extension == "ppsx" || extension.isEmpty())

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
            binding.loadingLayout.visibility = View.VISIBLE
            binding.epubWebView.visibility = View.VISIBLE
            binding.statusPillCard.visibility = View.VISIBLE
            binding.txtStatusPill.text = if (slideCount > 0) "$slideCount Slides • Presentation" else "Presentation"

            setupWebView()

            if (isPptx) {
                val encodedName = URLEncoder.encode(documentName, "UTF-8")
                val url = "https://appassets.androidplatform.net/assets/viewer/pptx.html?name=$encodedName&ext=pptx"
                binding.epubWebView.loadUrl(url)
            } else {
                // Fallback for legacy binary .ppt files
                val isDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                        android.content.res.Configuration.UI_MODE_NIGHT_YES
                val (html, _) = withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri)?.use { stream ->
                        PptxParser.parseToHtml(stream, false, isDark)
                    } ?: Pair("<html><body>Unable to read presentation.</body></html>", 0)
                }
                binding.loadingLayout.visibility = View.GONE
                binding.epubWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            }
        }
    }

    private fun populateTableView(data: SheetData) {
        val tableLayout = binding.sheetTableLayout
        tableLayout.removeAllViews()

        // 1. Header Row
        if (data.headers.isNotEmpty()) {
            val headerRow = TableRow(this)
            headerRow.setBackgroundColor(ContextCompat.getColor(this, R.color.surface_variant_light))

            // Top-left corner index
            val idxHeader = createTableCell("#", isHeader = true)
            headerRow.addView(idxHeader)

            data.headers.forEach { h ->
                headerRow.addView(createTableCell(h, isHeader = true))
            }
            tableLayout.addView(headerRow)
        }

        // 2. Data Rows
        data.rows.forEachIndexed { rIdx, row ->
            val tableRow = TableRow(this)
            // Row number cell
            tableRow.addView(createTableCell((rIdx + 1).toString(), isHeader = true))

            row.forEach { cellText ->
                tableRow.addView(createTableCell(cellText, isHeader = false))
            }
            tableLayout.addView(tableRow)
        }
    }

    private fun createTableCell(text: String, isHeader: Boolean): TextView {
        return TextView(this).apply {
            this.text = text
            setPadding(24, 16, 24, 16)
            textSize = if (isHeader) 12f else 13f
            typeface = if (isHeader) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            setTextColor(
                if (isHeader) ContextCompat.getColor(context, R.color.accent_cyan)
                else ContextCompat.getColor(context, R.color.text_primary_light)
            )
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setTextIsSelectable(true)
        }
    }

    // =========================================================================
    // 4. Markdown & Text Loader
    // =========================================================================
    private suspend fun loadMarkdownDocument(uri: Uri) {
        val raw = FileUtils.readStringFromUri(this@ViewerActivity, uri)
        val ssb = MarkdownParser.parseMarkdown(raw)
        withContext(Dispatchers.Main) {
            displayTextContent(ssb, "Markdown Document")
        }
    }

    private suspend fun loadTextDocument(uri: Uri) {
        val raw = FileUtils.readStringFromUri(this@ViewerActivity, uri)
        val ssb = SpannableStringBuilder(raw)
        withContext(Dispatchers.Main) {
            displayTextContent(ssb, "Text Document")
        }
    }

    // =========================================================================
    // 5. Code & Data Files Loader
    // =========================================================================
    private suspend fun loadCodeDocument(uri: Uri) {
        val raw = FileUtils.readStringFromUri(this@ViewerActivity, uri)
        val ext = documentName.substringAfterLast('.', "").lowercase()
        val ssb = CodeHighlighter.highlightCode(raw, ext)
        withContext(Dispatchers.Main) {
            displayTextContent(ssb, "Code File (${ext.uppercase()})")
        }
    }

    // =========================================================================
    // 6. EPUB E-Book Loader
    // =========================================================================
    private suspend fun loadEpubDocument(uri: Uri) {
        val isDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES
        val html = contentResolver.openInputStream(uri)?.use { stream ->
            EpubParser.parseEpub(stream, isDark)
        } ?: "<html><body>Unable to load EPUB</body></html>"

        withContext(Dispatchers.Main) {
            binding.loadingLayout.visibility = View.GONE
            binding.epubWebView.visibility = View.VISIBLE
            binding.epubWebView.settings.apply {
                builtInZoomControls = true
                displayZoomControls = false
                javaScriptEnabled = false
            }
            binding.epubWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            binding.txtStatusPill.text = "EPUB Reader Mode"
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
    }

    // =========================================================================
    // 8. In-Document Search Implementation
    // =========================================================================
    private fun setupSearchPanel() {
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
            if (searchMatchIndices.isNotEmpty()) {
                currentMatchIndex = (currentMatchIndex + 1) % searchMatchIndices.size
                updateSearchIndicator()
                scrollToCurrentMatch()
            }
        }

        binding.btnSearchPrev.setOnClickListener {
            if (searchMatchIndices.isNotEmpty()) {
                currentMatchIndex = if (currentMatchIndex - 1 < 0) searchMatchIndices.size - 1 else currentMatchIndex - 1
                updateSearchIndicator()
                scrollToCurrentMatch()
            }
        }
    }

    private fun performSearch(query: String) {
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
            dialog.dismiss()
        }
        dialog.show()
    }

    private fun toggleReadingTheme() {
        // Toggle background between White, Soft Sepia, and AMOLED Black
        val currentBg = binding.viewerRootLayout.background
        when (app.prefs.themeMode) {
            0, 1 -> { // Switch to Sepia
                app.prefs.themeMode = 4
                binding.viewerRootLayout.setBackgroundColor(Color.parseColor("#FBF0D9"))
                binding.contentTextView.setTextColor(Color.parseColor("#5F4B32"))
            }
            4 -> { // Switch to AMOLED Black
                app.prefs.themeMode = 3
                binding.viewerRootLayout.setBackgroundColor(Color.parseColor("#000000"))
                binding.contentTextView.setTextColor(Color.parseColor("#E2E8F0"))
            }
            else -> { // Switch to Default
                app.prefs.themeMode = 1
                binding.viewerRootLayout.setBackgroundColor(ContextCompat.getColor(this, R.color.background_light))
                binding.contentTextView.setTextColor(ContextCompat.getColor(this, R.color.text_primary_light))
            }
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
