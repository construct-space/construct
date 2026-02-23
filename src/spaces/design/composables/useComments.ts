/**
 * useComments - Comment management for UI Designer
 * Handles comment CRUD, replies, and resolution
 */
import type { Comment, CommentReply } from '~/types/design'

export function useComments() {
  const comments = ref<Comment[]>([])
  const activeCommentId = ref<string | null>(null)
  const isAddingComment = ref(false)

  // Get active comment
  const activeComment = computed(() =>
    comments.value.find(c => c.id === activeCommentId.value) ?? null
  )

  // Get unresolved comments count
  const unresolvedCount = computed(() =>
    comments.value.filter(c => !c.resolved).length
  )

  // Load comments from canvas data
  function loadComments(data: Comment[]) {
    comments.value = data
  }

  // Add a new comment
  function addComment(x: number, y: number, text: string, author: string = 'You'): Comment {
    const comment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      x,
      y,
      text,
      author,
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    }
    comments.value.push(comment)
    activeCommentId.value = comment.id
    isAddingComment.value = false
    return comment
  }

  // Update comment text
  function updateComment(id: string, text: string) {
    const comment = comments.value.find(c => c.id === id)
    if (comment) {
      comment.text = text
    }
  }

  // Delete a comment
  function deleteComment(id: string) {
    const index = comments.value.findIndex(c => c.id === id)
    if (index !== -1) {
      comments.value.splice(index, 1)
      if (activeCommentId.value === id) {
        activeCommentId.value = null
      }
    }
  }

  // Toggle comment resolved status
  function toggleResolved(id: string) {
    const comment = comments.value.find(c => c.id === id)
    if (comment) {
      comment.resolved = !comment.resolved
    }
  }

  // Add a reply to a comment
  function addReply(commentId: string, text: string, author: string = 'You'): CommentReply | null {
    const comment = comments.value.find(c => c.id === commentId)
    if (!comment) return null

    const reply: CommentReply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text,
      author,
      createdAt: new Date().toISOString(),
    }

    if (!comment.replies) {
      comment.replies = []
    }
    comment.replies.push(reply)
    return reply
  }

  // Delete a reply
  function deleteReply(commentId: string, replyId: string) {
    const comment = comments.value.find(c => c.id === commentId)
    if (comment?.replies) {
      const index = comment.replies.findIndex(r => r.id === replyId)
      if (index !== -1) {
        comment.replies.splice(index, 1)
      }
    }
  }

  // Move comment position
  function moveComment(id: string, x: number, y: number) {
    const comment = comments.value.find(c => c.id === id)
    if (comment) {
      comment.x = x
      comment.y = y
    }
  }

  // Select a comment
  function selectComment(id: string | null) {
    activeCommentId.value = id
  }

  // Start adding comment mode
  function startAddingComment() {
    isAddingComment.value = true
    activeCommentId.value = null
  }

  // Cancel adding comment
  function cancelAddingComment() {
    isAddingComment.value = false
  }

  // Export comments for saving
  function exportComments(): Comment[] {
    return JSON.parse(JSON.stringify(comments.value))
  }

  return {
    // State
    comments: readonly(comments),
    activeCommentId: readonly(activeCommentId),
    activeComment,
    isAddingComment: readonly(isAddingComment),
    unresolvedCount,

    // Methods
    loadComments,
    addComment,
    updateComment,
    deleteComment,
    toggleResolved,
    addReply,
    deleteReply,
    moveComment,
    selectComment,
    startAddingComment,
    cancelAddingComment,
    exportComments,
  }
}

// Singleton instance for global state
let instance: ReturnType<typeof useComments> | null = null

export function useCommentsState() {
  if (!instance) {
    instance = useComments()
  }
  return instance
}
