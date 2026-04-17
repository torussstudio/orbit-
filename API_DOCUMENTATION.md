# Orbit API Documentation

Base URL: `http://localhost:4000/api`

All endpoints except `/auth/login` and `/auth/register` require authentication via Bearer token in Authorization header.

## Authentication

### Login
**POST** `/auth/login`

Request:
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "name": "User Name",
    "email": "user@example.com",
    "role": "manager|developer"
  }
}
```

### Get Current User
**GET** `/auth/me`

Response:
```json
{
  "id": "uuid",
  "name": "User Name",
  "email": "user@example.com",
  "role": "manager"
}
```

---

## Members

### List All Members
**GET** `/members`

Response:
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "manager",
    "birthday": "1990-01-15",
    "skills": ["Project Management", "Planning"],
    "active": true,
    "created_at": "2026-04-17T10:00:00Z"
  }
]
```

### Create Member (Manager only)
**POST** `/members`

Request:
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "securepassword",
  "role": "developer",
  "birthday": "1995-06-20",
  "skills": ["React", "Node.js"]
}
```

Response: Member object (201 Created)

### Update Member (Manager only)
**PUT** `/members/:id`

Request:
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "role": "developer",
  "birthday": "1995-06-20",
  "skills": ["React", "Node.js", "PostgreSQL"]
}
```

Response: Updated member object

### Deactivate Member (Manager only)
**PATCH** `/members/:id/deactivate`

Response:
```json
{
  "success": true
}
```

---

## Projects

### List All Projects
**GET** `/projects`

Response:
```json
[
  {
    "id": "uuid",
    "name": "Project Name",
    "client_name": "Client Corp",
    "description": "Project description",
    "status": "active",
    "start_date": "2026-04-01",
    "end_date": "2026-06-30",
    "custom_stages": ["Todo", "In Progress", "In Review", "Done", "Deployed"],
    "created_by": "uuid",
    "created_at": "2026-04-01T10:00:00Z"
  }
]
```

### Create Project (Manager only)
**POST** `/projects`

Request:
```json
{
  "name": "New Project",
  "client_name": "Client Name",
  "description": "Project description",
  "start_date": "2026-04-20",
  "end_date": "2026-06-30",
  "custom_stages": ["Todo", "In Progress", "In Review", "Done", "Deployed"],
  "member_ids": ["uuid1", "uuid2"]
}
```

Response: Project object (201 Created)

### Update Project (Manager only)
**PUT** `/projects/:id`

Request: Same as create

Response: Updated project object

### Archive Project (Manager only)
**PATCH** `/projects/:id/archive`

Response:
```json
{
  "success": true
}
```

### Unarchive Project (Manager only)
**PATCH** `/projects/:id/unarchive`

Response:
```json
{
  "success": true
}
```

---

## Tasks

### Get Project Tasks
**GET** `/tasks/project/:projectId`

Query Parameters:
- `stage` (optional): Filter by stage
- `assignee_id` (optional): Filter by assignee

Response:
```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "cluster_id": "uuid|null",
    "title": "Task Title",
    "description": "Task description",
    "assignee_id": "uuid|null",
    "assignee_name": "John Doe",
    "priority": "low|medium|high|critical",
    "stage": "Todo",
    "due_date": "2026-05-15",
    "created_by": "uuid",
    "created_at": "2026-04-17T10:00:00Z",
    "updated_at": "2026-04-17T10:00:00Z"
  }
]
```

### Get Task Details
**GET** `/tasks/:id`

Response: Task object with comments and activity

### Create Task (Manager only)
**POST** `/tasks`

Request:
```json
{
  "project_id": "uuid",
  "cluster_id": "uuid|null",
  "title": "New Task",
  "description": "Task details",
  "assignee_id": "uuid|null",
  "priority": "medium",
  "stage": "Todo",
  "due_date": "2026-05-20"
}
```

Response: Task object (201 Created)

### Update Task
**PUT** `/tasks/:id`

Request:
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "assignee_id": "uuid|null",
  "priority": "high",
  "stage": "In Progress",
  "due_date": "2026-05-25",
  "cluster_id": "uuid|null"
}
```

Response: Updated task object

**Restrictions:**
- Developers: Can update stage (except 'Done', 'Deployed')
- Managers: Can update all fields

### Delete Task (Manager only)
**DELETE** `/tasks/:id`

Response:
```json
{
  "success": true
}
```

### Add Task Comment
**POST** `/tasks/:id/comments`

Request:
```json
{
  "content": "Comment text"
}
```

Response:
```json
{
  "id": "uuid",
  "task_id": "uuid",
  "author_id": "uuid",
  "author_name": "John Doe",
  "content": "Comment text",
  "created_at": "2026-04-17T10:30:00Z"
}
```

---

## Calendar

### Get All Calendar Data
**GET** `/calendar`

Response:
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Meeting",
      "description": "Team sync",
      "start_date": "2026-04-17T10:00:00Z",
      "end_date": "2026-04-17T11:00:00Z",
      "type": "event",
      "created_by": "uuid",
      "created_by_name": "Manager Name",
      "attendees": [
        {"id": "uuid", "name": "John Doe"}
      ],
      "created_at": "2026-04-17T09:00:00Z",
      "updated_at": "2026-04-17T09:00:00Z"
    }
  ],
  "tasks": [
    {
      "id": "uuid",
      "title": "Task Title",
      "due_date": "2026-05-15",
      "stage": "In Progress",
      "priority": "high",
      "project_name": "Project Name",
      "assignee_name": "Jane Smith"
    }
  ],
  "projects": [
    {
      "id": "uuid",
      "name": "Project Name",
      "end_date": "2026-06-30",
      "status": "active",
      "client_name": "Client Corp"
    }
  ],
  "birthdays": [
    {
      "id": "uuid",
      "name": "John Doe",
      "birthday": "1990-01-15"
    }
  ]
}
```

### Create Event (Manager only)
**POST** `/calendar`

Request:
```json
{
  "title": "Team Meeting",
  "description": "Weekly sync",
  "start_date": "2026-04-20T10:00:00Z",
  "end_date": "2026-04-20T11:00:00Z",
  "type": "event",
  "member_ids": ["uuid1", "uuid2"]
}
```

Response: Event object (201 Created)

### Update Event (Manager only)
**PUT** `/calendar/:id`

Request: Same as create

Response: Updated event object

### Delete Event (Manager only)
**DELETE** `/calendar/:id`

Response:
```json
{
  "success": true
}
```

### Search Members
**GET** `/calendar/search-members?email=query`

Query Parameters:
- `email` (required, min 2 chars): Email search query

Response:
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com"
  }
]
```

### Get Member Events
**GET** `/calendar/member/:memberId`

Response: Array of event objects for that member

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

### Common Status Codes

- `200` OK - Request successful
- `201` Created - Resource created successfully
- `400` Bad Request - Invalid request parameters
- `401` Unauthorized - Missing or invalid token
- `403` Forbidden - Insufficient permissions
- `404` Not Found - Resource not found
- `500` Internal Server Error - Server error

### Common Errors

**Missing Authorization**
```json
{
  "error": "No token provided"
}
```

**Invalid Token**
```json
{
  "error": "Invalid token"
}
```

**Insufficient Permissions**
```json
{
  "error": "Manager access required"
}
```

**Validation Error**
```json
{
  "error": "Duplicate email"
}
```

---

## Authentication Header

All authenticated requests require:

```
Authorization: Bearer <token>
```

Example using curl:
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  http://localhost:4000/api/members
```

Example using fetch:
```javascript
const response = await fetch('http://localhost:4000/api/members', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Rate Limiting

Currently not implemented. Recommended for production:
- 100 requests per 15 minutes per IP
- 1000 requests per hour per user

---

## Pagination

Currently not implemented. For large datasets, recommend:
- Limit default: 20
- Max limit: 100
- Offset-based pagination

Example implementation planned:
```
GET /api/tasks/project/:id?limit=20&offset=0
```

---

## Filtering & Sorting

### Available Filters

**Tasks:**
- `stage`: Filter by stage
- `assignee_id`: Filter by assignee
- `priority`: Filter by priority (low, medium, high, critical)

**Projects:**
- `status`: Filter by status (active, on_hold, completed, archived)

**Members:**
- `active`: Filter by active status (true/false)
- `role`: Filter by role (manager, developer)

**Example:**
```bash
GET /api/tasks/project/:id?stage=In%20Progress&priority=high
```

### Sorting

Not yet implemented. Recommended:
```bash
GET /api/tasks/project/:id?sort=due_date&order=asc
```

---

## Batch Operations

Not implemented. Consider for future:
- Batch create tasks
- Batch update task status
- Bulk member assignment

---

## WebSocket Events (Future)

Planned real-time updates:
- Task status changes
- New comments
- Member presence
- Calendar updates

---

**Last Updated:** April 17, 2026
**API Version:** 1.0
**Status:** Production Ready
