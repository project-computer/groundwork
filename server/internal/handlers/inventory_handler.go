package handlers

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

// RBAC matrix (slices 0007/0008): admin + pharmacist write; veterinarian read;
// receptionist and others no access. Route groups in cmd/api/main.go.

type SupplierHandler struct {
	service   *service.SupplierService
	validator *validator.Validate
}

func NewSupplierHandler(svc *service.SupplierService) *SupplierHandler {
	return &SupplierHandler{service: svc, validator: validator.New()}
}

func (h *SupplierHandler) Create(c fiber.Ctx) error {
	var req models.CreateSupplierRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.Create(c.Context(), middleware.GetClinicID(c), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *SupplierHandler) List(c fiber.Ctx) error {
	out, err := h.service.List(c.Context(), middleware.GetClinicID(c))
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch suppliers")
	}
	return c.JSON(out)
}

func (h *SupplierHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid supplier ID")
	}
	out, err := h.service.Get(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "supplier_not_found", "Supplier not found")
	}
	return c.JSON(out)
}

func (h *SupplierHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid supplier ID")
	}
	var req models.UpdateSupplierRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	out, err := h.service.Update(c.Context(), middleware.GetClinicID(c), id, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}
	return c.JSON(out)
}

func (h *SupplierHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid supplier ID")
	}
	if err := h.service.Delete(c.Context(), middleware.GetClinicID(c), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "delete_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Supplier deleted successfully", nil)
}

type ItemHandler struct {
	service   *service.ItemService
	validator *validator.Validate
}

func NewItemHandler(svc *service.ItemService) *ItemHandler {
	return &ItemHandler{service: svc, validator: validator.New()}
}

func (h *ItemHandler) Create(c fiber.Ctx) error {
	var req models.CreateInventoryItemRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.Create(c.Context(), middleware.GetClinicID(c), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *ItemHandler) List(c fiber.Ctx) error {
	q := models.InventoryItemListQuery{
		Page:     utils.GetQueryInt(c, "page", 1),
		Limit:    utils.GetQueryInt(c, "limit", 20),
		Category: c.Query("category"),
		Search:   c.Query("search"),
	}
	out, total, err := h.service.List(c.Context(), middleware.GetClinicID(c), q)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch inventory items")
	}
	return utils.PaginatedResponse(c, out, models.PaginationMeta{
		Page:       q.Page,
		Limit:      q.Limit,
		TotalItems: total,
		TotalPages: (total + q.Limit - 1) / q.Limit,
	})
}

func (h *ItemHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid item ID")
	}
	out, err := h.service.Get(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "item_not_found", "Inventory item not found")
	}
	return c.JSON(out)
}

func (h *ItemHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid item ID")
	}
	var req models.UpdateInventoryItemRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.Update(c.Context(), middleware.GetClinicID(c), id, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}
	return c.JSON(out)
}

func (h *ItemHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid item ID")
	}
	if err := h.service.Delete(c.Context(), middleware.GetClinicID(c), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "delete_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Item deleted successfully", nil)
}

// CreateLot registers a received batch of an item (stock-in with lot metadata).
func (h *ItemHandler) CreateLot(c fiber.Ctx) error {
	var req models.CreateInventoryLotRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.CreateLot(c.Context(), middleware.GetClinicID(c), middleware.GetUserID(c), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *ItemHandler) ListLots(c fiber.Ctx) error {
	itemID, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid item ID")
	}
	out, err := h.service.ListLots(c.Context(), middleware.GetClinicID(c), itemID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch lots")
	}
	return c.JSON(out)
}

type LotHandler struct {
	service   *service.ItemService
	validator *validator.Validate
}

func NewLotHandler(svc *service.ItemService) *LotHandler {
	return &LotHandler{service: svc, validator: validator.New()}
}

func (h *LotHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid lot ID")
	}
	out, err := h.service.GetLot(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "lot_not_found", "Lot not found")
	}
	return c.JSON(out)
}

func (h *LotHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid lot ID")
	}
	var req models.UpdateInventoryLotRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	out, err := h.service.UpdateLot(c.Context(), middleware.GetClinicID(c), id, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}
	return c.JSON(out)
}

// Movement records a stock op. Append-only: no update/delete endpoints exist
// (slice 0008 acceptance). A negative-going op on an empty lot surfaces the
// DB's CHECK constraint as a 409.
func (h *LotHandler) Movement(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid lot ID")
	}
	var req models.CreateStockMovementRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.RecordMovement(c.Context(), middleware.GetClinicID(c), id, middleware.GetUserID(c), req)
	if err != nil {
		if errors.Is(err, repository.ErrInsufficientStock) {
			return utils.ErrorResponse(c, fiber.StatusConflict, "insufficient_stock", err.Error())
		}
		if errors.Is(err, repository.ErrLotNotFound) {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "lot_not_found", "Lot not found")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "movement_failed", err.Error())
	}
	return c.Status(http.StatusCreated).JSON(out)
}

func (h *LotHandler) Movements(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid lot ID")
	}
	out, err := h.service.ListMovements(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch stock movements")
	}
	return c.JSON(out)
}
