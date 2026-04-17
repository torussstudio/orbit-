# Calendar Filter Bar Implementation Guide

## Overview
The Calendar Filter Bar is a comprehensive filtering system that allows users to filter calendar events based on registered members' emails. This document provides complete implementation details, API specifications, and usage instructions.

## Features Implemented

### 1. Filter Bar UI Component (`MemberFilterBar.js`)

**Location**: `client/src/components/ui/MemberFilterBar.js`

**Features:**
- Email-based member search with autocomplete
- Dropdown suggestions (max 5 visible, scrollable for more)
- Multi-select member filtering
- Chip/tag display of selected members
- Remove individual selections
- "Clear All" button
- Real-time filtering with 300ms debounce
- Outside-click dropdown close
- Loading indicator during search
- Empty state messaging

**Props:**
```javascript
{
  selectedMembers: Array<{id, name, email}>,  // Currently selected members
  onSelectionChange: Function,                 // Callback when selection changes
  isManager: Boolean,                          // User's role
  userEmail: String                            // Current user's email
}
```

**Styling:**
- Integrated with Orbit design system colors
- Responsive flex layout
- Smooth transitions and hover states
- Accessible keyboard navigation

### 2. Backend Enhancements

#### New Endpoint: Member Suggestions
**Route**: `GET /api/members/suggestions`
**Auth**: Required (JWT token)

**Query Parameters:**
- `search` (string, optional): Search term to filter members by name or email

**Response:**
```javascript
[
  {
    id: "uuid",
    name: "Rahul Kumar",
    email: "rahul@company.com"
  },
  {
    id: "uuid",
    name: "Aisha Patel",
    email: "aisha@company.com"
  }
]
```

**Features:**
- Case-insensitive search on name and email
- Returns only active members
- Limited to 10 results for performance
- Ordered alphabetically by name

#### Enhanced Endpoint: Calendar Events with Filtering
**Route**: `GET /api/calendar`
**Auth**: Required (JWT token)

**Query Parameters:**
- `members` (string, optional): Comma-separated list of member emails
  - Example: `members=rahul@company.com,aisha@company.com`

**Filtering Logic:**
- When members parameter provided:
  - Returns only events with attendees matching provided emails
  - Returns only tasks assigned to provided members
  - Returns all projects (not filtered by member)
  - Returns all birthdays (not filtered by member)
- When no members parameter:
  - Returns all events, tasks, projects, and birthdays

### 3. Calendar Component Integration

**Modified File**: `client/src/pages/Calendar.js`

**Changes:**
1. **New State Management:**
   - `selectedFilterMembers`: Array of selected member objects
   
2. **Updated Load Function:**
   - Now accepts query parameters for member filtering
   - Automatically triggered when filter selection changes
   - Includes error handling and loading state

3. **Filter Bar Integration:**
   - MemberFilterBar component placed after legend
   - Props passed: selectedMembers, onSelectionChange, isManager, userEmail

4. **Empty State Handling:**
   - "No events found" message when filters applied but no results
   - Message shows when: selectedFilterMembers > 0 AND no events/tasks/projects

5. **Conditional Rendering:**
   - Calendar views only render if there are events OR no filters applied
   - Empty state takes precedence when filters match no events

## Event Structure

### Calendar Event (from database)
```javascript
{
  id: "event-uuid",
  title: "Team Meeting",
  description: "Weekly sync",
  start_date: "2026-04-20T10:00:00Z",
  end_date: "2026-04-20T11:00:00Z",
  type: "event",
  created_by: "manager-id",
  created_by_name: "Manager Name",
  created_by_email: "manager@company.com",
  attendees: [
    { id: "member-id", name: "Rahul", email: "rahul@company.com" },
    { id: "member-id", name: "Aisha", email: "aisha@company.com" }
  ]
}
```

### Task (with due date for calendar)
```javascript
{
  id: "task-uuid",
  title: "Complete report",
  due_date: "2026-04-25",
  stage: "In Progress",
  priority: "high",
  assignee_id: "member-id",
  assignee_name: "Rahul",
  assignee_email: "rahul@company.com",
  project_name: "Project Alpha"
}
```

## Role-Based Access Control

### Manager Role
- ✅ Can see all members' emails in filter suggestions
- ✅ Can select any member to filter
- ✅ Can view events of any member
- ✅ Can view combined events of multiple members
- ✅ No automatic filtering - sees all events by default

### Member Role
- ✅ Can see their own email in filter suggestions
- ✅ Can see emails of other members in the same company
- ✅ Can filter and view events of selected members
- ⚠️ Future: Can always see their own events even if no filter applied

## User Flow

### 1. Accessing Calendar
1. User navigates to `/calendar` route
2. Calendar loads with all events, tasks, projects, and birthdays
3. Filter bar appears above the calendar grid

### 2. Using the Filter
1. User clicks search input
2. Filter bar shows empty state: "Search members..."
3. User types member name or email
4. Autocomplete dropdown shows matching members
5. Suggestions appear instantly (300ms debounce)
6. User clicks suggestion to select
7. Selected member appears as chip/tag
8. Calendar automatically updates to show only that member's events
9. User can add more members by searching again
10. User can remove individual members by clicking ✕ on chip
11. User can clear all by clicking "Clear All" button

### 3. Event Filtering
When filter applied:
- Calendar shows only events with selected member(s) as attendees
- Tasks show only if assigned to selected member(s)
- Projects remain visible (not member-specific)
- Birthdays remain visible
- If no events match filter: Show "No events found" message

## Technical Implementation Details

### Frontend State Flow
```
User selects member
    ↓
selectedFilterMembers state updated
    ↓
useEffect triggered
    ↓
load() function called with members parameter
    ↓
API call: GET /calendar?members=email1,email2
    ↓
Response filtered by backend
    ↓
Calendar re-renders with filtered data
```

### API Parameter Encoding
```javascript
// Multiple members
members=rahul@company.com,aisha@company.com

// Processing
const memberEmailList = 
  "rahul@company.com,aisha@company.com"
    .split(',')
    .map(e => e.trim().toLowerCase())

// Query
WHERE m2.email = ANY($1)  // PostgreSQL ANY operator
```

### Database Query (Member Filtering)
```sql
SELECT ce.*, m.name as created_by_name, m.email as created_by_email,
  COALESCE(json_agg(json_build_object(
    'id', m2.id, 'name', m2.name, 'email', m2.email
  )) FILTER (WHERE m2.id IS NOT NULL), '[]') as attendees
FROM calendar_events ce
LEFT JOIN members m ON ce.created_by = m.id
LEFT JOIN calendar_attendees ca ON ca.event_id = ce.id
LEFT JOIN members m2 ON ca.member_id = m2.id
WHERE m2.email = ANY($1)  -- Filter by attendee emails
GROUP BY ce.id, m.name, m.email
ORDER BY ce.start_date
```

## Error Handling

### Frontend Error Scenarios
1. **Failed member suggestions fetch**
   - Caught by try-catch
   - setSuggestions([]) to clear dropdown
   - Silent failure with console.error

2. **Failed calendar data fetch**
   - Caught by try-catch in load()
   - Sets loading to false
   - Calendar remains in previous state

3. **Network timeouts**
   - 300ms debounce prevents rapid requests
   - Axios default timeout applies

### Backend Error Scenarios
1. **Invalid token** → 401 Unauthorized
2. **Database error** → 500 with error message
3. **Invalid email format** → Filtered silently by WHERE clause

## Performance Optimizations

1. **Debounced Search**: 300ms debounce on search input
   - Reduces unnecessary API calls
   - Prevents flickering

2. **Query Optimization**:
   - Database uses indexed email lookups
   - Limits results to 10 suggestions
   - Uses JSON aggregation to batch attendee data

3. **Component Memoization**:
   - MemberFilterBar is efficient
   - Minimal re-renders due to focused state updates

4. **Dropdown Outside-Click Detection**:
   - Event listener cleanup on unmount
   - Prevents memory leaks

## Testing Instructions

### Prerequisites
- Both server (localhost:4000) and client (localhost:3002) running
- Valid JWT token in localStorage
- At least 2 members with events in database

### Test Scenarios

#### Test 1: Basic Search
1. Navigate to Calendar page
2. Click filter input
3. Type member name (e.g., "rah")
4. Verify dropdown shows matching members
5. Check that name and email are visible

#### Test 2: Multi-Select Filtering
1. Select first member
2. Verify chip appears
3. Search and select second member
4. Verify both chips appear
5. Check calendar updates with combined events

#### Test 3: Remove Filter
1. Select multiple members
2. Click ✕ on one chip
3. Verify chip removed
4. Verify calendar updates immediately

#### Test 4: Clear All
1. Select multiple members
2. Click "Clear All" button
3. Verify all chips removed
4. Verify calendar shows all events

#### Test 5: No Results
1. Select member with no events
2. Verify "No events found" message
3. Verify calendar grid is hidden
4. Clear filter to restore

#### Test 6: Empty State
1. With no filter, verify all events show
2. Verify filter input shows placeholder

#### Test 7: Scrollable Dropdown
1. Add many members to ensure >5 suggestions
2. Type to trigger suggestions
3. Verify dropdown shows max 5 items
4. Verify scrollbar appears for additional items

## Database Schema Requirements

### Existing Tables Used
- `members`: id, name, email, role, active, created_at
- `calendar_events`: id, title, description, start_date, end_date, type, created_by
- `calendar_attendees`: event_id, member_id
- `tasks`: id, title, due_date, assignee_id, project_id
- `projects`: id, name, end_date, status

### Indexing Recommendations
```sql
-- For performance
CREATE INDEX idx_members_email_lower ON members(LOWER(email));
CREATE INDEX idx_members_name_lower ON members(LOWER(name));
CREATE INDEX idx_calendar_attendees_member_id ON calendar_attendees(member_id);
CREATE INDEX idx_calendar_attendees_event_id ON calendar_attendees(event_id);
```

## Future Enhancements

1. **Event Creation Dialog**
   - Add "assignedMembers" field to event creation
   - Pre-fill with filter selections

2. **Member Presence Indicators**
   - Show online/offline status
   - Show recent activity

3. **Advanced Filters**
   - Filter by event type
   - Filter by date range
   - Filter by event priority

4. **Saved Filters**
   - Allow users to save frequent filter combinations
   - Quick access buttons

5. **Bulk Operations**
   - Select multiple events
   - Bulk assign to members

6. **Calendar Sharing**
   - Share filtered calendar view via link
   - Collaborative filtering

## API Response Examples

### Member Suggestions Response
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Rahul Kumar",
    "email": "rahul@company.com"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Rahul Singh",
    "email": "rahul.singh@company.com"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Aisha Patel",
    "email": "aisha@company.com"
  }
]
```

### Calendar Filtered Response
```json
{
  "events": [
    {
      "id": "evt-001",
      "title": "Team Standup",
      "start_date": "2026-04-21T09:00:00Z",
      "end_date": "2026-04-21T09:30:00Z",
      "description": "Daily sync",
      "type": "event",
      "created_by": "mgr-001",
      "created_by_name": "Manager",
      "created_by_email": "manager@company.com",
      "attendees": [
        {
          "id": "mem-001",
          "name": "Rahul",
          "email": "rahul@company.com"
        }
      ]
    }
  ],
  "tasks": [
    {
      "id": "tsk-001",
      "title": "Complete documentation",
      "due_date": "2026-04-22",
      "stage": "In Progress",
      "priority": "high",
      "assignee_id": "mem-001",
      "assignee_name": "Rahul",
      "assignee_email": "rahul@company.com",
      "project_name": "Project Alpha"
    }
  ],
  "projects": [],
  "birthdays": []
}
```

## Troubleshooting

### Issue: Suggestions not appearing
- **Check**: API endpoint `/api/members/suggestions` is accessible
- **Check**: Authorization header is valid
- **Check**: Search term is at least 1 character
- **Check**: Active members exist in database

### Issue: Filter not working
- **Check**: Member email is exactly matching in database
- **Check**: Events have attendees with that email
- **Check**: Calendar data is being fetched (check network tab)

### Issue: Dropdown not scrolling
- **Check**: CSS max-height is set (200px)
- **Check**: overflowY is 'auto'
- **Check**: Browser zoom level (might affect scroll)

### Issue: Performance lag
- **Check**: Database has proper indexes
- **Check**: 300ms debounce is working
- **Check**: Not fetching more than 10 suggestions

## Files Modified/Created

1. **Created**:
   - `client/src/components/ui/MemberFilterBar.js` (310 lines)

2. **Modified**:
   - `client/src/pages/Calendar.js` (Added filter state, updated load function, integrated filter bar)
   - `server/routes/members.js` (Added `/suggestions` endpoint)
   - `server/routes/calendar.js` (Already had filtering support)

## Summary

The Filter Bar implementation provides a robust, user-friendly interface for filtering calendar events by member selection. With role-based access control, efficient database queries, and responsive UI components, users can quickly find and view events relevant to specific team members.

The system is scalable, maintainable, and ready for future enhancements such as saved filters, advanced search options, and collaborative features.
