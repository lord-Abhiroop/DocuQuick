package com.docuquick.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.docuquick.app.databinding.ActivityMainBinding
import com.docuquick.app.model.DocumentType
import com.docuquick.app.model.RecentFile
import com.docuquick.app.ui.RecentFilesAdapter

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var recentAdapter: RecentFilesAdapter
    private val app get() = application as DocuQuickApp

    // Document Picker Contract
    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        uri?.let { openViewer(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // If launched via system intent, forward to ViewerActivity immediately
        if (intent?.action == Intent.ACTION_VIEW || intent?.action == Intent.ACTION_SEND) {
            forwardToViewer(intent)
            return
        }

        setupRecyclerView()
        setupFilterChips()
        setupFab()
    }

    override fun onResume() {
        super.onResume()
        loadRecentFiles()
    }

    private fun setupRecyclerView() {
        recentAdapter = RecentFilesAdapter { recent ->
            val uri = Uri.parse(recent.uriString)
            openViewer(uri)
        }

        binding.recentsRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = recentAdapter
        }
    }

    private fun loadRecentFiles() {
        val files = app.prefs.getRecentFiles()
        recentAdapter.setFiles(files)

        if (files.isEmpty()) {
            binding.emptyStateLayout.visibility = View.VISIBLE
            binding.recentsRecyclerView.visibility = View.GONE
        } else {
            binding.emptyStateLayout.visibility = View.GONE
            binding.recentsRecyclerView.visibility = View.VISIBLE
        }
    }

    private fun setupFilterChips() {
        binding.filterChipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            if (checkedIds.isEmpty()) {
                recentAdapter.filterByType(null)
                return@setOnCheckedStateChangeListener
            }

            when (checkedIds.first()) {
                R.id.chipPdf -> recentAdapter.filterByType(DocumentType.PDF)
                R.id.chipWord -> recentAdapter.filterByType(DocumentType.WORD)
                R.id.chipExcel -> recentAdapter.filterByType(DocumentType.EXCEL)
                R.id.chipPpt -> recentAdapter.filterByType(DocumentType.PPT)
                R.id.chipText -> recentAdapter.filterByTypes(listOf(DocumentType.TEXT, DocumentType.MARKDOWN))
                R.id.chipBooks -> recentAdapter.filterByType(DocumentType.EPUB)
                R.id.chipCode -> recentAdapter.filterByType(DocumentType.CODE)
                else -> recentAdapter.filterByType(null)
            }
        }
    }

    private fun setupFab() {
        binding.fabOpenDocument.setOnClickListener {
            // Document types supported
            openDocumentLauncher.launch(
                arrayOf(
                    "application/pdf",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "application/vnd.ms-powerpoint",
                    "text/csv",
                    "text/plain",
                    "text/markdown",
                    "application/epub+zip",
                    "application/json",
                    "application/xml",
                    "text/*",
                    "image/*",
                    "*/*"
                )
            )
        }
    }

    private fun openViewer(uri: Uri) {
        try {
            if (uri.scheme == "content") {
                try {
                    contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (e: Exception) {
                    // Ignore if not supported by provider
                }
            }

            val intent = Intent(this, ViewerActivity::class.java).apply {
                data = uri
                if (uri.scheme == "content") {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            startActivity(intent)
        } catch (e: Exception) {
            android.widget.Toast.makeText(this, "Unable to open document: ${e.localizedMessage}", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun forwardToViewer(incoming: Intent) {
        val viewerIntent = Intent(this, ViewerActivity::class.java).apply {
            action = incoming.action
            data = incoming.data
            type = incoming.type
            if (incoming.hasExtra(Intent.EXTRA_STREAM)) {
                putExtra(Intent.EXTRA_STREAM, incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            }
            if (incoming.clipData != null) {
                clipData = incoming.clipData
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(viewerIntent)
        } catch (e: Exception) {
            android.widget.Toast.makeText(this, "Error forwarding document: ${e.localizedMessage}", android.widget.Toast.LENGTH_SHORT).show()
        }
        finish()
    }
}
