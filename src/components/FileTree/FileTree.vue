<template>
  <div class="file-tree">
    <div class="tree-header">
      <h3>文件目录结构</h3>
      <span class="file-count" v-if="filteredNode">{{ getFileCount(filteredNode) }} 个文件</span>
    </div>
    <div class="tree-content" v-if="filteredNode">
      <TreeNode :node="filteredNode" :level="0" />
    </div>
    <div class="tree-empty" v-else>
      <p>暂无文件结构</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FileTreeNode } from '@/utils/zip-handler'
import TreeNode from './TreeNode.vue'

interface Props {
  node?: FileTreeNode
}

const props = defineProps<Props>()

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

// 计算属性：过滤后的节点
const filteredNode = computed(() => {
  if (!props.node) {
    return undefined
  }
  return filterSystemFiles(props.node)
})

// 计算文件总数
const getFileCount = (node: FileTreeNode): number => {
  if (node.type === 'file') {
    return 1
  }
  if (!node.children) {
    return 0
  }
  return node.children.reduce((count, child) => count + getFileCount(child), 0)
}
</script>

<style scoped>
.file-tree {
  width: 100%;
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e5e7eb;
}

.tree-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #374151;
}

.file-count {
  font-size: 14px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 4px 12px;
  border-radius: 12px;
}

.tree-content {
  max-height: 600px;
  overflow-y: auto;
}

.tree-empty {
  text-align: center;
  padding: 40px;
  color: #9ca3af;
}
</style>

