# Calendar Filtering API Reference

## Base URL
```
http://localhost:4000/api
```

## Authentication
All endpoints require Bearer token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. GET /calendar

Fetch calendar events, tasks, projects, and birthdays with optional member filtering.

#### Request

**URL:** `GET /calendar`

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `members` | string | No | Comma-separated member emails for filtering (e.g., `john@example.com,jane@example.com`) |

#### Examples

**1. Get all calendar data (no filter):**

```bash
curl -X GET http://localhost:4000/api/calendar \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

**2. Get calendar filtered by single member:**

```bash
curl -X GET "http://localhost:4000/api/calendar?members=john@example.com" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

**3. Get calendar filtered by multiple members:**

```bash
curl -X GET "http://localhost:4000/api/calendar?members=john@example.com,jane@example.com" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

#### Response

**Status:** 200 OK

**Body:**
```json
{
  "events": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Team Standup",
      "description": "Daily sync with the team",
      "start_date": "2026-04-20T10:00:00.000Z",
      "end_date": "2026-04-20T10:30:00.000Z",
      "type": "event",
      "created_by": "550e8400-e29b-41d4-a716-446655440002",
      "created_by_name": "John Doe",
      "created_by_email": "john@example.com",
      "attendees": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440003",
          "name": "Jane Smith",
          "email": "jane@example.com"
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440004",
          "name": "Bob Wilson",
          "email": "bob@example.com"
        }
      ],
      "created_at": "2026-04-15T08:00:00.000Z",
      "updated_at": "2026-04-15T08:00:00.000Z"
    }
  ],
  "tasks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "title": "Implement calendar filtering",
      "due_date": "2026-04-25",
      "stage": "In Progress",
      "priority": "high",
      "assignee_id": "550e8400-e29b-41d4-a716-446655440003",
      "assignee_name": "Jane Smith",
      "assignee_email": "jane@example.com",
      "project_name": "Orbit Enhancement",
      "description": "Add member-based filtering to calendar"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440011",
      "title": "Write documentation",
      "due_date": "2026-04-30",
      "stage": "Todo",
      "priority": "medium",
      "assignee_id": "550e8400-e29b-41d4-a716-446655440004",
      "assignee_name": "Bob Wilson",
      "assignee_email": "bob@example.com",
      "project_name": "Orbit Enhancement",
      "description": "Complete API and usage documentation"
    }
  ],
  "projects": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440020",
      "name": "Q2 Release",
      "client_name": "Acme Corp",
      "end_date": "2026-06-30",
      "status": "active"
    }
  ],
  "birthdays": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440030",
      "name": "John Doe",
      "birthday": "1990-04-15"
    }
  ]
}
```

#### Filtering Logic

When `members` parameter is provided:

**Events:** Only includes events where at least one selected member is an attendee
```sql
SELECT ce.* FROM calendar_events ce
WHERE EXISTS (
  SELECT 1 FROM calendar_attendees ca
  JOIN members m ON ca.member_id = m.id
  WHERE ca.event_id = ce.id
  AND m.email = ANY(array_of_selected_emails)
)
```

**Tasks:** Only includes tasks assigned to selected members
```sql
SELECT t.* FROM tasks t
WHERE t.assignee_id IN (
  SELECT id FROM members
  WHERE email = ANY(array_of_selected_emails)
)
```

**Projects & Birthdays:** Not filtered (always returned)

---

### 2. GET /calendar/search-members

Search for members by email.

#### Request

**URL:** `GET /calendar/search-members`

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Email search query (min 2 characters) |

#### Examples

**1. Search members by email prefix:**

```bash
curl -X GET "http://localhost:4000/api/calendar/search-members?email=john" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

**2. Search for specific domain:**

```bash
curl -X GET "http://localhost:4000/api/calendar/search-members?email=@example.com" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

**3. Case-insensitive search:**

```bash
curl -X GET "http://localhost:4000/api/calendar/search-members?email=JANE" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
```

#### Response

**Status:** 200 OK

**Body:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "name": "Jane Smith",
    "email": "jane.smith@example.com"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "name": "Jane Doe",
    "email": "jane.doe@example.com"
  }
]
```

**Constraints:**
- Returns maximum 10 results
- Requires email query length >= 2 characters
- Only returns active members (`active = true`)
- Case-insensitive search using `ILIKE`

#### Error Response

**Status:** 200 OK (empty array if no matches)

```json
[]
```

---

### 3. POST /calendar

Create a new calendar event.

#### Request

**URL:** `POST /calendar`

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Event title |
| `description` | string | No | Event description |
| `start_date` | ISO8601 | Yes | Start date/time |
| `end_date` | ISO8601 | No | End date/time (defaults to start_date) |
| `type` | string | No | Event type: 'event', 'task', 'deadline', 'birthday' |
| `member_ids` | array | No | Array of member IDs to invite |

#### Example

```bash
curl -X POST http://localhost:4000/api/calendar \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q2 Planning Session",
    "description": "Quarterly planning and roadmap discussion",
    "start_date": "2026-04-25T14:00:00Z",
    "end_date": "2026-04-25T15:30:00Z",
    "type": "event",
    "member_ids": [
      "550e8400-e29b-41d4-a716-446655440003",
      "550e8400-e29b-41d4-a716-446655440004"
    ]
  }'
```

#### Response

**Status:** 201 Created

**Body:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440050",
  "title": "Q2 Planning Session",
  "description": "Quarterly planning and roadmap discussion",
  "start_date": "2026-04-25T14:00:00.000Z",
  "end_date": "2026-04-25T15:30:00.000Z",
  "type": "event",
  "created_by": "550e8400-e29b-41d4-a716-446655440002",
  "created_at": "2026-04-17T10:30:00.000Z",
  "updated_at": "2026-04-17T10:30:00.000Z"
}
```

---

### 4. PUT /calendar/:id

Update an existing calendar event.

#### Request

**URL:** `PUT /calendar/:id`

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Event ID |

**Body:** Same as POST /calendar

#### Example

```bash
curl -X PUT http://localhost:4000/api/calendar/550e8400-e29b-41d4-a716-446655440050 \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q2 Planning Session - Updated",
    "start_date": "2026-04-26T14:00:00Z",
    "end_date": "2026-04-26T16:00:00Z",
    "member_ids": [
      "550e8400-e29b-41d4-a716-446655440003",
      "550e8400-e29b-41d4-a716-446655440004",
      "550e8400-e29b-41d4-a716-446655440005"
    ]
  }'
```

#### Response

**Status:** 200 OK

**Body:** Updated event object (same structure as POST response)

---

### 5. DELETE /calendar/:id

Delete a calendar event.

#### Request

**URL:** `DELETE /calendar/:id`

**Headers:**
```http
Authorization: Bearer <token>
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Event ID |

#### Example

```bash
curl -X DELETE http://localhost:4000/api/calendar/550e8400-e29b-41d4-a716-446655440050 \
  -H "Authorization: Bearer your_jwt_token_here"
```

#### Response

**Status:** 200 OK

**Body:**
```json
{
  "success": true
}
```

---

### 6. GET /calendar/member/:memberId

Get calendar events for a specific member.

#### Request

**URL:** `GET /calendar/member/:memberId`

**Headers:**
```http
Authorization: Bearer <token>
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memberId` | UUID | Yes | Member ID |

#### Example

```bash
curl -X GET http://localhost:4000/api/calendar/member/550e8400-e29b-41d4-a716-446655440003 \
  -H "Authorization: Bearer your_jwt_token_here"
```

#### Response

**Status:** 200 OK

**Body:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "title": "Team Standup",
    "start_date": "2026-04-20T10:00:00.000Z",
    "end_date": "2026-04-20T10:30:00.000Z",
    "type": "event",
    "created_by": "550e8400-e29b-41d4-a716-446655440002",
    "created_at": "2026-04-15T08:00:00.000Z"
  }
]
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid query parameter"
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found

```json
{
  "error": "Event not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Database error: connection refused"
}
```

---

## Rate Limiting

- No rate limiting currently implemented
- Recommended: Implement 100 requests/minute per user

---

## Pagination

- Currently returns all results
- Recommended for future: Add `limit` and `offset` parameters

---

## Testing with Postman

### 1. Set up environment variables:

```
{{base_url}} = http://localhost:4000/api
{{token}} = your_jwt_token_here
```

### 2. Test endpoint:

**Request:**
```
GET {{base_url}}/calendar?members=john@example.com
Authorization: Bearer {{token}}
```

### 3. Save response as example:

- Right-click response
- Select "Save as example"
- Name it "Calendar Filter - Single Member"

---

## JavaScript Fetch Examples

### Get all calendar data

```javascript
const response = await fetch('http://localhost:4000/api/calendar', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
console.log(data);
```

### Get calendar filtered by members

```javascript
const memberEmails = 'john@example.com,jane@example.com';
const response = await fetch(
  `http://localhost:4000/api/calendar?members=${encodeURIComponent(memberEmails)}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);
const data = await response.json();
console.log(data);
```

### Search members

```javascript
const response = await fetch(
  'http://localhost:4000/api/calendar/search-members?email=john',
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);
const members = await response.json();
console.log(members);
```

### Create event

```javascript
const response = await fetch('http://localhost:4000/api/calendar', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'New Event',
    start_date: new Date().toISOString(),
    member_ids: ['member-id-1', 'member-id-2']
  })
});
const event = await response.json();
console.log(event);
```

---

## Query Parameter Encoding

When using special characters in query parameters, always URL-encode them:

```javascript
const query = 'john+doe@example.com';
const encoded = encodeURIComponent(query); // john%2Bdoe%40example.com

fetch(`/api/calendar/search-members?email=${encoded}`)
```

---

## Performance Tips

1. **Cache member list in sessionStorage** to avoid repeated API calls
2. **Debounce search** to 300ms minimum between requests
3. **Use pagination** if filtering large result sets
4. **Add database indexes** on `members.email` and `members.active`
5. **Compress responses** using gzip if > 1MB

---

## Changelog

### v1.0.0 (2026-04-17)
- Initial release
- GET /calendar with member filtering
- GET /calendar/search-members
- POST /calendar create event
- PUT /calendar/:id update event
- DELETE /calendar/:id delete event
- GET /calendar/member/:memberId member events

---

**Documentation Version:** 1.0.0  
**Last Updated:** 2026-04-17  
**Status:** Production Ready
