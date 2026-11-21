package com.docuquick.app.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.docuquick.app.R
import com.docuquick.app.model.DocumentType
import com.docuquick.app.model.RecentFile
import com.docuquick.app.util.FileUtils

class RecentFilesAdapter(
    private val onFileClick: (RecentFile) -> Unit
) : RecyclerView.Adapter<RecentFilesAdapter.RecentViewHolder>() {

    private var allFiles: List<RecentFile> = emptyList()
    private var filteredFiles: List<RecentFile> = emptyList()
    private var currentFilter: DocumentType? = null

    fun setFiles(files: List<RecentFile>) {
        allFiles = files
        applyFilter()
    }

    fun filterByType(type: DocumentType?) {
        currentFilter = type
        applyFilter()
    }

    private fun applyFilter() {
        filteredFiles = if (currentFilter == null) {
            allFiles
        } else {
            allFiles.filter { it.type == currentFilter }
        }
        notifyDataSetChanged()
    }

    override fun getItemCount(): Int = filteredFiles.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecentViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_recent_file, parent, false)
        return RecentViewHolder(view)
    }

    override fun onBindViewHolder(holder: RecentViewHolder, position: Int) {
        holder.bind(filteredFiles[position])
    }

    inner class RecentViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val imgDocType: ImageView = itemView.findViewById(R.id.imgDocType)
        private val txtFileName: TextView = itemView.findViewById(R.id.txtFileName)
        private val txtFileMeta: TextView = itemView.findViewById(R.id.txtFileMeta)
        private val txtBadgeTag: TextView = itemView.findViewById(R.id.txtBadgeTag)

        fun bind(file: RecentFile) {
            txtFileName.text = file.name
            imgDocType.setImageResource(file.type.iconRes)

            val sizeStr = FileUtils.formatFileSize(file.sizeBytes)
            val timeStr = FileUtils.formatLastOpened(file.lastOpened)
            txtFileMeta.text = "$sizeStr • ${file.type.categoryName} • $timeStr"

            txtBadgeTag.text = file.type.categoryName
            val color = ContextCompat.getColor(itemView.context, file.type.badgeColorRes)
            txtBadgeTag.setTextColor(color)

            itemView.setOnClickListener {
                onFileClick(file)
            }
        }
    }
}
