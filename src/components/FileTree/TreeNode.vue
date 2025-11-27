<template>
  <div class="tree-node">
    <div 
      class="node-item" 
      :class="{ 
        'is-directory': node.type === 'directory', 
        'is-file': node.type === 'file',
        'has-blob': node.type === 'file' && node.blobUrl,
        'clickable': node.type === 'file' && node.blobUrl
      }"
      :style="{ paddingLeft: `${level * 20 + 8}px` }"
      @click="handleNodeClick"
    >
      <span class="node-icon">
        <!-- 目录图标 -->
        <svg 
          v-if="node.type === 'directory'" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none"
          :class="{ 'expanded': isExpanded }"
        >
          <path 
            d="M5 19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V9C19 7.9 18.1 7 17 7H12L10 5H7C5.9 5 5 5.9 5 7V19Z" 
            stroke="currentColor" 
            stroke-width="2"
            fill="currentColor"
            fill-opacity="0.1"
          />
          <path 
            v-if="!isExpanded"
            d="M9 12L12 9L15 12" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round"
            style="transform: translate(4px, 4px);"
          />
          <path 
            v-else
            d="M12 9L9 12L12 15" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round"
            style="transform: translate(4px, 4px);"
          />
        </svg>
        <!-- 文件图标 -->
        <svg 
          v-else 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none"
        >
          <path 
            d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z" 
            stroke="currentColor" 
            stroke-width="2"
            fill="currentColor"
            fill-opacity="0.1"
          />
          <path 
            d="M14 2V8H20" 
            stroke="currentColor" 
            stroke-width="2"
          />
        </svg>
      </span>
      <span class="node-name">{{ node.name }}</span>
      <span class="node-size" v-if="node.type === 'file' && node.size">
        {{ formatFileSize(node.size) }}
      </span>
    </div>
    
    <!-- 子节点 -->
    <div 
      v-if="node.type === 'directory' && node.children && isExpanded" 
      class="node-children"
    >
      <TreeNode 
        v-for="child in node.children" 
        :key="child.path"
        :node="child"
        :level="level + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FileTreeNode } from '@/utils/zip-handler'

interface Props {
  node: FileTreeNode
  level: number
}

const props = defineProps<Props>()

const isExpanded = ref(props.level < 2) // 默认展开前两级

const toggleExpand = () => {
  if (props.node.type === 'directory') {
    isExpanded.value = !isExpanded.value
  }
}

const handleNodeClick = () => {
  if (props.node.type === 'directory') {
    toggleExpand()
  } else if (props.node.type === 'file' && props.node.blobUrl) {
    openFile()
  }
}

const openFile = () => {
  if (!props.node.blobUrl || !props.node.blob) {
    console.warn('文件没有 blobUrl 或 blob，无法打开:', props.node.name)
    return
  }
  
  try {
    // 对于 HTML 文件，直接下载到本地，让用户自己打开
    const isHTML = props.node.name.toLowerCase().endsWith('.html')
    
    if (isHTML) {
      // HTML 文件直接下载
      const link = document.createElement('a')
      link.href = props.node.blobUrl
      link.download = props.node.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      // 其他文件尝试在新标签页打开
      const newWindow = window.open(props.node.blobUrl, '_blank')
      
      if (!newWindow) {
        // 如果弹窗被阻止，改为下载
        const link = document.createElement('a')
        link.href = props.node.blobUrl
        link.download = props.node.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    }
  } catch (error) {
    console.error('打开文件失败:', error)
    // 如果打开失败，尝试下载
    if (props.node.blob && props.node.blobUrl) {
      const link = document.createElement('a')
      link.href = props.node.blobUrl
      link.download = props.node.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<style scoped>
.tree-node {
  user-select: none;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-radius: 4px;
  gap: 8px;
}

.node-item:hover {
  background-color: #f3f4f6;
}

.node-item.is-directory {
  font-weight: 500;
}

.node-item.is-file {
  font-weight: 400;
  color: #6b7280;
}

.node-item.clickable {
  cursor: pointer;
}

.node-item.clickable:hover {
  background-color: #e0e7ff;
  color: #3b82f6;
}

.node-item.has-blob::after {
  content: '🔗';
  margin-left: 4px;
  font-size: 12px;
  opacity: 0.6;
}

.node-icon {
  display: flex;
  align-items: center;
  color: #3b82f6;
  flex-shrink: 0;
}

.node-icon svg {
  width: 16px;
  height: 16px;
}

.node-name {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-size {
  font-size: 12px;
  color: #9ca3af;
  margin-left: auto;
}

.node-children {
  margin-left: 0;
}

.expanded {
  color: #10b981;
}
</style>

