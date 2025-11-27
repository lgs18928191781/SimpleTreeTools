<template>
  <div class="metatree-container">
    <div class="container-header">
      <h1 class="title">SimpleTree</h1>
      <p class="subtitle">上传压缩包并查看文件目录结构</p>
    </div>

    <div class="content-wrapper">
      <!-- 上传区域 -->
      <div class="upload-section">
        <div 
          class="upload-area"
          :class="{ 
            'drag-over': isDragOver, 
            'uploading': isProcessing,
            'has-file': selectedFile
          }"
          @click="!isProcessing && triggerFileInput()"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".zip,.rar,.7z,application/zip,application/x-zip-compressed"
            @change="handleFileSelect"
            style="display: none;"
          />

          <div class="upload-content" v-if="!selectedFile && !isProcessing">
            <div class="upload-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 16V8C21 6.9 20.1 6 19 6H14L12 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20H19C20.1 20 21 19.1 21 18V16Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M8 14H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <h3>点击选择压缩包或拖拽到此处</h3>
            <p class="upload-hint">支持 ZIP、RAR、7Z 格式</p>
          </div>

          <!-- 处理中状态 -->
          <div class="upload-content processing" v-if="isProcessing">
            <div class="spinner"></div>
            <h3>{{ progressText }}</h3>
            <div class="progress-bar-container">
              <div class="progress-bar">
                <div 
                  class="progress-fill" 
                  :style="{ width: `${progressPercent}%` }"
                ></div>
              </div>
              <span class="progress-text">{{ Math.round(progressPercent) }}%</span>
            </div>
            <p class="current-file" v-if="currentFile">{{ currentFile }}</p>
          </div>

          <!-- 已选择文件 -->
          <div class="upload-content file-selected" v-if="selectedFile && !isProcessing">
            <div class="file-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M21 16V8C21 6.9 20.1 6 19 6H14L12 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20H19C20.1 20 21 19.1 21 18V16Z" stroke="currentColor" stroke-width="2"/>
                <path d="M8 10H16" stroke="currentColor" stroke-width="2"/>
                <path d="M8 14H16" stroke="currentColor" stroke-width="2"/>
              </svg>
            </div>
            <h3>{{ selectedFile.name }}</h3>
            <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
            <button class="change-file-btn" @click.stop="resetUpload">
              更换文件
            </button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons" v-if="selectedFile && !isProcessing">
          <button 
            class="btn btn-primary" 
            @click="handleExtract"
            :disabled="isProcessing"
          >
            开始解压
          </button>
          <button 
            class="btn btn-secondary" 
            @click="resetUpload"
          >
            重置
          </button>
        </div>
      </div>

      <!-- 文件树展示区域 -->
      <div class="tree-section" v-if="fileTree">
        <FileTree :node="fileTree" />
      </div>

      <!-- MetaTree 表单区域 -->
      <div class="meta-tree-section" v-if="fileTree">
        <MetaTree :processedTree="fileTree" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { extractZip, saveExtractedFilesToSources, processHTMLFiles, type FileTreeNode, type ExtractProgress } from '@/utils/zip-handler'
import JSZip from 'jszip'
import { useToast } from '@/components/Toast/useToast'
import FileTree from '@/components/FileTree/FileTree.vue'
import MetaTree from '@/components/FileTree/MetaTree.vue'

const { showToast } = useToast()

// 响应式数据
const fileInput = ref<HTMLInputElement>()
const selectedFile = ref<File | null>(null)
const isDragOver = ref(false)
const isProcessing = ref(false)
const progressPercent = ref(0)
const progressText = ref('准备中...')
const currentFile = ref('')
const fileTree = ref<FileTreeNode | null>(null)

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 触发文件选择
const triggerFileInput = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    if (isValidZipFile(file)) {
      selectedFile.value = file
    } else {
      showToast('请选择有效的压缩包文件（ZIP、RAR、7Z）', 'error')
    }
  }
}

// 验证文件类型
const isValidZipFile = (file: File): boolean => {
  const validTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed'
  ]
  const validExtensions = ['.zip', '.rar', '.7z']
  const fileName = file.name.toLowerCase()
  
  return validTypes.includes(file.type) || 
         validExtensions.some(ext => fileName.endsWith(ext))
}

// 拖拽处理
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    const file = event.dataTransfer.files[0]
    if (isValidZipFile(file)) {
      selectedFile.value = file
    } else {
      showToast('请选择有效的压缩包文件（ZIP、RAR、7Z）', 'error')
    }
  }
}

// 处理解压
const handleExtract = async () => {
  if (!selectedFile.value) {
    showToast('请先选择压缩包文件', 'warning')
    return
  }

  isProcessing.value = true
  progressPercent.value = 0
  progressText.value = '正在解压...'
  currentFile.value = ''

  try {
    // 解压文件
    const { tree, zipContent } = await extractZip(selectedFile.value, (progress: ExtractProgress) => {
      progressPercent.value = progress.percent * 0.5 // 前50%用于解压
      progressText.value = `正在解压... ${Math.round(progress.percent)}%`
      if (progress.currentFile) {
        currentFile.value = progress.currentFile
      }
    })

    // 处理 HTML 文件并下载外部资源
    progressText.value = '正在分析 HTML 文件...'
    try {
      const processedTree = await processHTMLFiles(
        zipContent,
        tree,
        (progress: ExtractProgress) => {
          progressPercent.value = 50 + (progress.percent * 0.5) // 后50%用于处理 HTML
          progressText.value = progress.currentFile || '正在处理 HTML 文件...'
          if (progress.currentFile) {
            currentFile.value = progress.currentFile
          }
        }
      )
      
      // 使用处理后的树
      fileTree.value = processedTree
    } catch (error) {
      console.warn('处理 HTML 文件失败:', error)
      // 如果处理失败，使用原始树
      fileTree.value = tree
    }

    // 保存文件到 sources 目录（这里需要后端支持）
    progressText.value = '正在保存文件...'
    try {
      await saveExtractedFilesToSources(selectedFile.value, fileTree.value)
    } catch (error) {
      console.warn('保存文件到 sources 失败（可能需要后端支持）:', error)
      // 不影响主流程，继续执行
    }

    // 显示成功提示
    showToast('压缩包解压成功！', 'success', 5000)
    
    // 滚动到文件树区域
    setTimeout(() => {
      const treeSection = document.querySelector('.tree-section')
      if (treeSection) {
        treeSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 500)

  } catch (error) {
    console.error('解压失败:', error)
    showToast(
      error instanceof Error ? error.message : '解压失败，请检查文件格式',
      'error',
      5000
    )
  } finally {
    isProcessing.value = false
    progressText.value = '完成'
  }
}

// 重置上传
const resetUpload = () => {
  selectedFile.value = null
  fileTree.value = null
  progressPercent.value = 0
  currentFile.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<style scoped>
.metatree-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.container-header {
  text-align: center;
  margin-bottom: 40px;
  color: white;
}

.title {
  font-size: 48px;
  font-weight: 700;
  margin: 0 0 12px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.subtitle {
  font-size: 18px;
  margin: 0;
  opacity: 0.9;
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.upload-section {
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.upload-area {
  border: 3px dashed #d1d5db;
  border-radius: 12px;
  padding: 60px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #f9fafb;
  position: relative;
  overflow: hidden;
}

.upload-area:hover:not(.uploading) {
  border-color: #667eea;
  background: #f0f4ff;
}

.upload-area.drag-over {
  border-color: #667eea;
  background: #e0e7ff;
  transform: scale(1.02);
}

.upload-area.uploading {
  border-color: #10b981;
  background: #ecfdf5;
  cursor: not-allowed;
}

.upload-area.has-file {
  border-color: #10b981;
  background: #ecfdf5;
}

.upload-content {
  position: relative;
  z-index: 1;
}

.upload-icon {
  color: #667eea;
  margin-bottom: 20px;
}

.upload-content h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #374151;
}

.upload-hint {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
}

.processing {
  padding: 20px;
}

.spinner {
  width: 64px;
  height: 64px;
  border: 5px solid #e5e7eb;
  border-top: 5px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 24px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.progress-bar-container {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #667eea;
  min-width: 50px;
  text-align: right;
}

.current-file {
  margin-top: 12px;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-selected {
  padding: 20px;
}

.file-icon {
  color: #10b981;
  margin-bottom: 16px;
}

.file-size {
  color: #6b7280;
  font-size: 14px;
  margin: 8px 0 16px;
}

.change-file-btn {
  padding: 8px 20px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.change-file-btn:hover {
  background: #e5e7eb;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

.btn {
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.tree-section {
  background: white;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.5s ease;
}

.meta-tree-section {
  background: white;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.5s ease;
  margin-top: 30px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .metatree-container {
    padding: 20px 12px;
  }

  .title {
    font-size: 36px;
  }

  .upload-section {
    padding: 24px;
  }

  .upload-area {
    padding: 40px 16px;
  }

  .action-buttons {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>

