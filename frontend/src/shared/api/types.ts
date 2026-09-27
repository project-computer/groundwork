// Mirrors backend/internal/models/common.go — keep in sync.
// Every endpoint returns exactly one of these three shapes (see docs/PLAN.md §9).

export type ErrorResponse = {
  error: string
  message?: string
}

export type SuccessResponse<T> = {
  message: string
  data?: T
}

export type PaginationMeta = {
  page: number
  limit: number
  totalItems: number
  totalPages: number
}

export type PaginatedResponse<T> = {
  data: T[]
  meta: PaginationMeta
}
