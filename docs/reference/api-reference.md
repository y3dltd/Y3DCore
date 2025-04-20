# ---
# title: API Reference
# last-reviewed: 2025-04-18
# maintainer: TBD
# ---

# Y3DHub API Reference

This document provides a comprehensive reference for all API endpoints available in the Y3DHub system.

## Base URLs
- **Production:** `https://<your-y3dhub-instance>/api`
- **Development:** `http://localhost:3000/api`

## Authentication
All API requests require authentication using one of the following methods:
- **Bearer Token:** Include an `Authorization` header with a Bearer token. 
  `Authorization: Bearer <API_KEY>`
- **API Key:** For specific endpoints (like sync operations), include an `X-Sync-API-Key` header.
  `X-Sync-API-Key: <SYNC_API_KEY>`

## Error Handling
API errors are returned with appropriate HTTP status codes and JSON response bodies.

Common error codes include:

| Status Code | Error Code | Description |
| ----------- | ---------- | ----------- |
| 400         | `INVALID_REQUEST` | The request body or parameters are invalid |
| 401         | `AUTHENTICATION_FAILED` | Authentication failed |
| 403         | `PERMISSION_DENIED` | The authenticated user does not have permission |
| 404         | `RESOURCE_NOT_FOUND` | The requested resource does not exist |
| 429         | `RATE_LIMIT_EXCEEDED` | The rate limit has been exceeded |
| 500         | `INTERNAL_ERROR` | An internal server error occurred |

Error response format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}  // Optional additional details
  }
}
```

## Versioning
The current API version is v1. The version is not currently included in the URL path but may be in future releases.

## Endpoints

### Orders
#### Get Orders
Fetches orders with pagination.

`GET /api/orders`

**Query Parameters:**
| Parameter | Type    | Description                   | Default |
| --------- | ------- | -----------------------------| ------- |
| `page`    | integer | Page number                   | 1       |
| `limit`   | integer | Items per page (max 100)      | 20      |

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "shipstation_order_id": "12345",
      "order_number": "ABC-123",
      "order_status": "awaiting_shipment",
      "created_at": "2025-04-01T12:00:00Z",
      "updated_at": "2025-04-01T12:00:00Z"
      // Additional order fields...
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20
  }
}
```

#### Get Order by ID
Fetches a specific order by ID.

`GET /api/orders/:id`

**Path Parameters:**
| Parameter | Type    | Description   |
| --------- | ------- | ------------- |
| `id`      | integer | Order ID      |

**Response:**
```json
{
  "id": 123,
  "shipstation_order_id": "12345",
  "order_number": "ABC-123",
  "order_status": "awaiting_shipment",
  "created_at": "2025-04-01T12:00:00Z",
  "updated_at": "2025-04-01T12:00:00Z",
  "customer": {
    "id": 456,
    "name": "John Doe",
    "email": "john.doe@example.com"
    // Additional customer fields...
  },
  "items": [
    {
      "id": 789,
      "sku": "ITEM-001",
      "name": "Custom Keychain",
      "quantity": 2,
      "unit_price": 15.99
      // Additional item fields...
    }
  ]
  // Additional order fields...
}
```

### Print Tasks
#### Update Print Task
Updates a specific print task.

`PATCH /api/print-tasks/:taskId`

**Path Parameters:**
| Parameter | Type    | Description    |
| --------- | ------- | -------------- |
| `taskId`  | integer | Print task ID  |

**Request Body:**
```json
{
  "custom_text": "Updated text",
  "color_1": "#FF0000",
  "color_2": "#00FF00",
  "notes": "Additional notes",
  "needs_review": false // Other updatable fields...
}
```

**Response:**
```json
{
  "id": 123,
  "custom_text": "Updated text",
  "color_1": "#FF0000",
  "color_2": "#00FF00",
  "notes": "Additional notes",
  "needs_review": false,
  "updated_at": "2025-04-01T12:00:00Z"
  // Other task fields...
}
```

#### Update Print Task Status
Updates just the status of a print task.

`PATCH /api/print-tasks/:taskId/status`

**Path Parameters:**
| Parameter | Type    | Description    |
| --------- | ------- | -------------- |
| `taskId`  | integer | Print task ID  |

**Request Body:**
```json
{
  "status": "completed"
}
```

**Response:**
```json
{
  "id": 123,
  "status": "completed",
  "updated_at": "2025-04-01T12:00:00Z"
}
```

#### Bulk Update Print Task Status
Updates the status of multiple print tasks at once.

`PATCH /api/print-tasks/bulk-status`

**Request Body:**
```json
{
  "taskIds": [123, 456, 789],
  "status": "in_progress"
}
```

**Response:**
```json
{
  "updated": 3,
  "failed": 0,
  "taskIds": [123, 456, 789]
}
```

#### Bulk Update Print Task Names
Updates the names of multiple print tasks at once.

`PATCH /api/tasks/bulk-update-name`

**Request Body:**
```json
{
  "taskIds": [123, 456, 789],
  "custom_text": "New standardized text"
}
```

**Response:**
```json
{
  "updated": 3,
  "failed": 0,
  "taskIds": [123, 456, 789]
}
```

### Sync Operations
#### Sync ShipStation Orders
Triggers a synchronization of orders from ShipStation.

`POST /api/sync/shipstation`

**Headers:**
`X-Sync-API-Key: <SYNC_API_KEY>`

**Request Body (Optional):**
```json
{
  "mode": "recent",  // "all", "recent", "single"
  "orderId": 12345,  // Required if mode is "single"
  "daysBack": 7      // Optional, default is 7 for "recent" mode
}
```

**Response:**
```json
{
  "success": true,
  "message": "ShipStation sync triggered successfully",
  "details": {
    "ordersProcessed": 25,
    "ordersCreated": 5,
    "ordersUpdated": 20,
    "startTime": "2025-04-01T12:00:00Z",
    "endTime": "2025-04-01T12:05:00Z",
    "executionTimeMs": 300000
  }
}
```

## Rate Limiting
API endpoints are rate-limited to protect the system from excessive usage. The current rate limits are:
- **Standard Endpoints:** 60 requests per minute per API key
- **Sync Operations:** 5 requests per minute per API key

When a rate limit is exceeded, the API will return a `429 Too Many Requests` status code.

## Testing and Development
For local development, you can use tools like Postman or curl to interact with the API.

Example curl command:
```bash
curl -X GET "http://localhost:3000/api/orders?page=1&limit=20" \
  -H "Authorization: Bearer your_api_key_here" \
  -H "Content-Type: application/json"
```

## Webhooks
Y3DHub can also send webhook notifications for various events. These are configured in the admin settings.

### Webhook Events
| Event Type           | Description                              |
| -------------------- | ---------------------------------------- |
| `order.created`      | Triggered when a new order is created    |
| `order.updated`      | Triggered when an order is updated       |
| `order.shipped`      | Triggered when an order is marked as shipped |
| `print_task.created` | Triggered when a new print task is created |
| `print_task.updated` | Triggered when a print task is updated   |
| `print_task.completed` | Triggered when a print task is completed |

### Webhook Payload Format
```json
{
  "event": "order.created",
  "timestamp": "2025-04-01T12:00:00Z",
  "data": {
    // Event-specific data
  }
}
```

## Changelog
### v1.0.0 (April 2025)
- Initial release of the Y3DHub API

