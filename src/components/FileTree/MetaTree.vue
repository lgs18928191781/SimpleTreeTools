<template>
  <div class="meta-tree-form">
    <div class="form-header">
      <div class="header-content">
        <div>
          <h3>文件树表单</h3>
          <p class="form-description">基于文件树结构生成表单</p>
        </div>
        <button
          class="upload-btn"
          @click="uploadSimpleTree"
          :disabled="isUploading || formItems.length === 0"
        >
          <span v-if="isUploading">上链中...</span>
          <span v-else>上链 SimpleTree</span>
        </button>
      </div>

      <!-- 上链进度 -->
      <div v-if="uploadProgress" class="upload-progress">
        {{ uploadProgress }}
      </div>

      <!-- 上链结果 -->
      <div v-if="rootPinId" class="upload-result">
        <strong>根 PinID:</strong>
        <code>{{ rootPinId }}</code>
      </div>
    </div>

    <div class="form-content" v-if="formItems.length > 0">
      <div 
        v-for="(item, index) in formItems" 
        :key="item.id"
        class="form-item"
        :class="{ 
          'is-directory': item.type === 'tree',
          'is-file': item.type === 'blob',
          'expanded': item.expanded
        }"
        :style="{ paddingLeft: `${item.level * 24 + 16}px` }"
      >
        <!-- 目录折叠按钮 -->
        <button 
          v-if="item.type === 'tree'"
          class="expand-btn"
          @click="toggleExpand(item)"
          :aria-expanded="item.expanded"
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none"
            :class="{ 'expanded': item.expanded }"
          >
            <path 
              d="M9 18L15 12L9 6" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <span v-else class="expand-placeholder"></span>

        <!-- 表单字段 -->
        <div class="form-fields">
          <div class="field-group">
            <label class="field-label">Name:</label>
            <input 
              type="text" 
              class="field-input"
              v-model="item.name"
              :readonly="!item.editable"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Path:</label>
            <input 
              type="text" 
              class="field-input path-input"
              v-model="item.path"
              readonly
            />
          </div>

          <div class="field-group">
            <label class="field-label">Type:</label>
            <input 
              type="text" 
              class="field-input type-input"
              :value="item.type"
              readonly
            />
          </div>

          <div class="field-group" v-if="item.type === 'blob'">
            <label class="field-label">Size:</label>
            <input 
              type="text" 
              class="field-input size-input"
              :value="formatFileSize(item.size || 0)"
              readonly
            />
          </div>
        </div>
      </div>
    </div>

    <div class="form-empty" v-else>
      <p>暂无数据，请先上传并解压压缩包</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { FileTreeNode } from '@/utils/zip-handler'
import { uploadFileToChainDirect } from '@/lib/metafs'
import { useCreateProtocols } from '@/hooks/use-create-protocols'
import pako from 'pako'

interface FormItem {
  id: string
  name: string
  path: string
  type: 'blob' | 'tree'
  size?: number
  level: number
  expanded: boolean
  editable: boolean
  children?: FormItem[]
  node: FileTreeNode // 保留原始 node 引用
  pinId?: string // 上链后的 PinID
}

interface SimpleTreeEntry {
  type: 'blob' | 'tree'
  file: string
  name: string
}

interface Props {
  processedTree?: FileTreeNode
}

const props = defineProps<Props>()

const formItems = ref<FormItem[]>([])
let itemIdCounter = 0

// 生成唯一 ID
const generateId = (): string => {
  return `item-${++itemIdCounter}`
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 过滤掉系统文件：__MACOSX 文件夹和 .DS_Store 文件
 */
const filterSystemFiles = (node: FileTreeNode): FileTreeNode | null => {
  // 如果是 __MACOSX 文件夹，直接返回 null（过滤掉）
  if (node.name === '__MACOSX' && node.type === 'directory') {
    return null
  }

  // 如果是 .DS_Store 文件，直接返回 null（过滤掉）
  if (node.name === '.DS_Store' && node.type === 'file') {
    return null
  }

  // 如果是文件，直接返回
  if (node.type === 'file') {
    return node
  }

  // 如果是目录，递归过滤子节点
  if (node.type === 'directory' && node.children) {
    const filteredChildren = node.children
      .map(child => filterSystemFiles(child))
      .filter((child): child is FileTreeNode => child !== null)

    // 如果过滤后没有子节点，且不是根节点，可以选择是否保留空目录
    // 这里我们保留空目录（除了 __MACOSX）
    return {
      ...node,
      children: filteredChildren.length > 0 ? filteredChildren : undefined
    }
  }

  return node
}

// 将 FileTreeNode 转换为 FormItem
const convertNodeToFormItem = (
  node: FileTreeNode, 
  level: number = 0,
  parentPath: string = ''
): FormItem | null => {
  // 过滤系统文件
  if (node.name === '__MACOSX' && node.type === 'directory') {
    return null
  }
  if (node.name === '.DS_Store' && node.type === 'file') {
    return null
  }

  const formItem: FormItem = {
    id: generateId(),
    name: node.name,
    path: node.path,
    type: node.type === 'file' ? 'blob' : 'tree',
    size: node.size,
    level,
    expanded: level < 2, // 默认展开前两级
    editable: false, // 默认不可编辑，可根据需求调整
    node // 保留原始 node 引用
  }

  // 如果有子节点，递归转换并过滤
  if (node.children && node.children.length > 0) {
    const filteredChildren = node.children
      .map(child => convertNodeToFormItem(child, level + 1, node.path))
      .filter((child): child is FormItem => child !== null)
    
    if (filteredChildren.length > 0) {
      formItem.children = filteredChildren
    }
  }

  return formItem
}

// 存储所有表单项的引用（用于展开/折叠）
const allFormItems = ref<FormItem[]>([])

// 将树形结构展平为列表（用于表单渲染）
const flattenTree = (items: FormItem[]): FormItem[] => {
  const result: FormItem[] = []
  
  const traverse = (items: FormItem[]) => {
    for (const item of items) {
      result.push(item)
      // 如果展开且有子节点，递归添加子节点
      if (item.expanded && item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }
  
  traverse(items)
  return result
}

// 根据 ID 查找表单项（在所有项中查找，包括未展开的）
const findItemById = (items: FormItem[], id: string): FormItem | null => {
  for (const item of items) {
    if (item.id === id) {
      return item
    }
    if (item.children) {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

// 构建表单数据
const buildFormData = () => {
  if (!props.processedTree) {
    formItems.value = []
    allFormItems.value = []
    return
  }

  // 先过滤系统文件
  const filteredTree = filterSystemFiles(props.processedTree)
  if (!filteredTree) {
    formItems.value = []
    allFormItems.value = []
    return
  }

  // 将树形结构转换为表单项
  const rootItem = convertNodeToFormItem(filteredTree, 0)
  if (!rootItem) {
    formItems.value = []
    allFormItems.value = []
    return
  }
  
  // 保存所有项的引用
  const saveAllItems = (item: FormItem): FormItem[] => {
    const items = [item]
    if (item.children) {
      item.children.forEach(child => {
        items.push(...saveAllItems(child))
      })
    }
    return items
  }
  allFormItems.value = saveAllItems(rootItem)
  
  // 展平树形结构为列表（用于显示）
  formItems.value = flattenTree([rootItem])
  
}

// 切换展开/折叠
const toggleExpand = (item: FormItem) => {
  if (item.type !== 'tree' || !item.children) {
    return
  }
  
  // 在所有项中查找对应的项并更新其展开状态
  const targetItem = findItemById(allFormItems.value, item.id)
  if (targetItem) {
    targetItem.expanded = !targetItem.expanded
  }
  
  // 更新当前项的展开状态
  item.expanded = !item.expanded
  
  // 重新构建表单数据以反映展开/折叠状态
  buildFormData()
}

// 监听 processedTree 变化
watch(() => props.processedTree, () => {
  buildFormData()
}, { deep: true, immediate: true })

onMounted(() => {
  buildFormData()
})

// ==================== 上链 SimpleTree 功能 ====================
const { createSimpletree } = useCreateProtocols()
const isUploading = ref(false)
const uploadProgress = ref('')
const rootPinId = ref('')

// 定义事件
const emit = defineEmits<{
  (e: 'upload-complete', pinId: string): void
  (e: 'upload-error', error: Error): void
}>()

/**
 * Gzip 压缩文件
 */
async function compressFile(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  const compressed = pako.gzip(uint8Array)
  return new Blob([compressed], { type: 'application/gzip' })
}

/**
 * 上链单个文件
 * @returns metafile://txIdi0 格式的 pinId
 */
async function uploadFile(item: FormItem): Promise<string> {
  if (!item.node.blob) {
    throw new Error(`文件 ${item.name} 没有内容`)
  }

  // Gzip 压缩
  const compressedBlob = await compressFile(item.node.blob)

  // 创建 File 对象用于上传
  const file = new File([compressedBlob], item.name, {
    type: item.node.blob.type || 'application/octet-stream'
  })

  // 上链
  const result = await uploadFileToChainDirect(file)

  // 返回 metafile://txIdi0 格式
  return `metafile://${result.txId}i0`
}

/**
 * 递归上链目录
 * 从最底层开始，先上链文件，再上链目录结构
 */
async function uploadDirectory(item: FormItem): Promise<string> {
  
  if (!item.children || item.children.length === 0) {
    throw new Error(`目录 ${item.name} 没有子项`)
  }

  const entries: SimpleTreeEntry[] = []

  // 处理所有子项
  for (const child of item.children) {
    uploadProgress.value = `正在处理: ${child.name}`
    
    let pinId: string

    if (child.type === 'blob') {
      // 文件：直接上链
      pinId = await uploadFile(child)
      console.log(`✅ 文件 ${child.name} 上链成功: ${pinId}`)
    } else {
      // 目录：递归上链
      pinId = await uploadDirectory(child)
      console.log(`✅ 目录 ${child.name} 上链成功: ${pinId}`)
    }

    child.pinId = pinId
    entries.push({
      type: child.type,
      file: pinId,
      name: child.name
    })
  }

  // 创建 SimpleTree 协议数据
  const treeBody = {
    treeName: item.name,
    entries: entries
  }

  uploadProgress.value = `正在上链目录: ${item.name}`

  // 调用 createSimpletree 上链
  const result = await createSimpletree({
    body: treeBody,
    path: '/protocols/simpletree',
    contentType: 'application/json'
  })
  
  // 返回 pinId
  const pinId = `${result.txid}i0`
  item.pinId = pinId

  return pinId
}

/**
 * 上链整个文件树
 */
async function uploadSimpleTree() {
  
  if (allFormItems.value.length === 0) {
    alert('没有可上链的文件')
    return
  }

  // 获取根节点
  const rootItem = allFormItems.value[0]
  
  if (!rootItem) {
    alert('无法获取根节点')
    return
  }

  isUploading.value = true
  uploadProgress.value = '开始上链...'
  rootPinId.value = ''

  try {
    let finalPinId: string

    if (rootItem.type === 'blob') {
      // 如果根节点是文件，直接上链
      finalPinId = await uploadFile(rootItem)
    } else {
      // 如果根节点是目录，递归上链
      finalPinId = await uploadDirectory(rootItem)
    }
    
    rootPinId.value = finalPinId
    uploadProgress.value = '上链完成!'
    console.log('🎉 整个文件树上链完成!')
    console.log('根 PinID:', finalPinId)

    emit('upload-complete', finalPinId)
    alert(`上链成功!\n根 PinID: ${finalPinId}`)

  } catch (error) {
    const err = error as Error
    console.error('❌ 上链失败:', err)
    uploadProgress.value = `上链失败: ${err.message}`
    emit('upload-error', err)
    alert(`上链失败: ${err.message}`)
  } finally {
    isUploading.value = false
  }
}

// 暴露方法给父组件
defineExpose({
  uploadSimpleTree,
  rootPinId
})
</script>

<style scoped>
.meta-tree-form {
  width: 100%;
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.form-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e5e7eb;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.upload-btn {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover:not(:disabled) {
  background: #2563eb;
}

.upload-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.upload-progress {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0f9ff;
  border-radius: 4px;
  font-size: 13px;
  color: #0369a1;
}

.upload-result {
  margin-top: 12px;
  padding: 12px;
  background: #f0fdf4;
  border-radius: 4px;
  font-size: 13px;
  color: #166534;
}

.upload-result code {
  display: block;
  margin-top: 8px;
  padding: 8px;
  background: #dcfce7;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  word-break: break-all;
}

.form-header h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #374151;
}

.form-description {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.form-content {
  max-height: 800px;
  overflow-y: auto;
}

.form-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
  transition: background-color 0.2s;
  gap: 12px;
}

.form-item:hover {
  background-color: #f9fafb;
}

.form-item.is-directory {
  font-weight: 500;
}

.form-item.is-file {
  font-weight: 400;
}

.expand-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;
  border-radius: 4px;
}

.expand-btn:hover {
  background-color: #e5e7eb;
  color: #374151;
}

.expand-btn svg {
  transition: transform 0.2s;
}

.expand-btn svg.expanded {
  transform: rotate(90deg);
}

.expand-placeholder {
  width: 24px;
  flex-shrink: 0;
}

.form-fields {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 2fr 120px auto;
  gap: 12px;
  align-items: center;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  transition: all 0.2s;
}

.field-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.field-input[readonly] {
  background-color: #f9fafb;
  cursor: default;
}

.path-input {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.type-input {
  text-align: center;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
}

.type-input[value="blob"] {
  color: #3b82f6;
  background-color: #dbeafe;
  border-color: #93c5fd;
}

.type-input[value="tree"] {
  color: #10b981;
  background-color: #d1fae5;
  border-color: #6ee7b7;
}

.size-input {
  text-align: right;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  min-width: 80px;
}

.form-empty {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .form-fields {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .field-group {
    width: 100%;
  }
}

/* 滚动条样式 */
.form-content::-webkit-scrollbar {
  width: 8px;
}

.form-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.form-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.form-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>

