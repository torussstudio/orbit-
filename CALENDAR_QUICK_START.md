# Calendar Filtering - Quick Start Guide

## Overview

Filter calendar events and tasks to see only items assigned to specific team members.

---

## How to Use

### 1. Open the Calendar

Navigate to the **Calendar** page from the main menu.

### 2. Search for a Member

1. Click on the **"Filter by Members"** search box
2. Start typing a member's **email** or **name**
3. Suggestions appear as you type

**Example:** Type "jane" to find all Janes

### 3. Select a Member

1. Click on a suggestion to select it
2. The calendar **automatically updates**
3. You'll see a tag showing the selected member

### 4. Add More Members (Optional)

1. Click the search box again
2. Select another member
3. Calendar shows events for **both** members
4. Repeat to add more

### 5. View Events

The calendar now shows:
- ✅ Events this member attends
- ✅ Tasks assigned to this member
- ❌ Events without this member (hidden)

### 6. Remove a Filter

**To remove one member:**
- Click the **✕** on their tag

**To clear all filters:**
- Click **"Clear all filters"** button

---

## Example Workflows

### Scenario 1: View Jane's Schedule

```
1. Calendar page opens
2. Type "jane" in filter box
3. Results: "Jane Smith (jane@example.com)"
4. Click to select
5. Calendar shows only Jane's events/tasks
6. See "Jane Smith" tag with ✕ button
```

### Scenario 2: Team View (Multiple Members)

```
1. Type "jane" → Select Jane Smith
2. Calendar shows Jane's items
3. Type "bob" → Select Bob Wilson
4. Calendar now shows Jane + Bob's items
5. Add Alice too
6. Calendar shows all three's items
7. Click ✕ on Bob's tag
8. Calendar shows Jane + Alice (Bob removed)
```

### Scenario 3: Clear and Start Over

```
1. Have 3 members selected
2. Click "Clear all filters"
3. All filters removed
4. Calendar shows all events again
```

---

## Tips & Tricks

### ⚡ Performance Tip
- Use **filters to focus** on specific team members
- Reduces visual clutter
- Faster to find relevant items

### 🔍 Search Tips
- Search by **email**: jane@example.com
- Search by **name**: Jane Smith
- Search by **partial**: just type "jane"
- Works even if you **misspell** slightly

### 📱 Mobile Tip
- Filters work the same on mobile
- Tap to select/deselect members
- Use landscape mode for better view

### ⌨️ Keyboard Tip
- Press **Tab** to navigate suggestions
- Press **Enter** to select highlighted member
- Press **Escape** to close dropdown

---

## What Gets Filtered?

### ✅ Filtered Items

| Type | Filter By | Example |
|------|-----------|---------|
| **Events** | Attendees | "Team Meeting" with Jane attending |
| **Tasks** | Assignee | "Fix bug" assigned to Jane |

### ❌ Not Filtered

| Type | Why | Shown |
|------|-----|-------|
| **Birthdays** | Company-wide info | Always shown |
| **Projects** | Team deadlines | Always shown |

---

## Troubleshooting

### Problem: Can't find a member

**Solution:**
1. Check spelling of email
2. Try different part of name
3. Member might be inactive/archived
4. Ask admin to check member status

### Problem: No events showing

**Solution:**
1. Member might have no assigned items
2. Try removing filter to see all events
3. Check if team member has any tasks
4. Events might be in past

### Problem: Filter disappeared

**Solution:**
1. Refresh page (filter may reset)
2. Check sessionStorage in browser
3. Filter clears on browser close
4. Select filter again

### Problem: Slow search

**Solution:**
1. Wait for suggestions to load
2. Clear browser cache
3. Check internet connection
4. Restart browser

---

## FAQ

**Q: Can I filter by multiple members?**
A: Yes! Select multiple members and calendar shows all their items.

**Q: Do filters save when I close browser?**
A: No. Filters clear when you close the browser tab. Select again when returning.

**Q: Can I filter by event type?**
A: Not yet. Current version only filters by member. More filters coming soon!

**Q: Does filtering show hidden events?**
A: No. Only shows events you have permission to see.

**Q: Can managers see all employees' events?**
A: Only events assigned to selected members. Managers see same filtered view as others.

**Q: What if member leaves company?**
A: They become inactive and won't appear in search. Existing selections can be cleared.

**Q: Can I export filtered calendar?**
A: Not in current version. Feature planned for future release.

**Q: Does search show teammates from other companies?**
A: No. Only shows members from your company.

---

## Keyboard Shortcuts (If Enabled)

| Key | Action |
|-----|--------|
| `/` | Focus search box |
| `Tab` | Navigate suggestions |
| `Enter` | Select member |
| `Escape` | Close dropdown |
| `Backspace` | Clear last character |

---

## Calendar Views with Filters

### Month View
- See all events for selected members
- Click day for detailed view
- Color-coded by event type

### Week View
- Similar to month but zoomed in
- Better for detailed planning
- Shows hourly breakdown

### Day View
- Highly detailed single day view
- Perfect for daily standup
- Shows all events with times

**Filters work the same in all views!**

---

## Visual Guide

### Searching for a Member

```
┌──────────────────────────────────────┐
│  Filter by Members               🔍   │
│  [Search box: "jane"]                │
│                                       │
│  ▼ Suggestions                       │
│  ├─ Jane Smith (jane@example.com)   │
│  ├─ Jane Doe (jane.doe@example.com) │
│  └─ More...                          │
└──────────────────────────────────────┘
```

### Selected Member Tag

```
┌──────────────────────────────────┐
│ Active Filters: 2                │
│                                   │
│ ┌─────────────────┐  ┌─────────┐ │
│ │ Jane Smith  ✕  │  │ Bob  ✕  │ │
│ └─────────────────┘  └─────────┘ │
│                                   │
│ [Clear all filters]              │
└──────────────────────────────────┘
```

### Empty State

```
┌────────────────────────────────────┐
│ April 20, 2026 (Monday)            │
│                                     │
│ No events for selected members     │
│ on this day.                       │
│                                     │
│ [Clear filters] [Select different] │
└────────────────────────────────────┘
```

---

## Related Features

- **📅 Calendar Events** - Create and manage events
- **📋 Task Management** - Assign tasks to members
- **👥 Member Directory** - View all team members
- **🔔 Notifications** - Get event reminders

---

## Getting Help

### I Need More Help

1. Check **CALENDAR_FILTERING_GUIDE.md** for technical details
2. See **CALENDAR_API_REFERENCE.md** for API documentation
3. Contact your **System Administrator**
4. Review **CALENDAR_IMPLEMENTATION_SUMMARY.md** for complete info

### Report a Bug

1. Open Browser DevTools (F12)
2. Go to Console tab
3. Copy any error messages
4. Submit to: **support@example.com**
5. Include:
   - What you were doing
   - Error message
   - Browser type
   - Screen resolution

---

## Best Practices

### ✅ Do

- ✅ Use filters to focus on your team's work
- ✅ Clear filters when done to see full calendar
- ✅ Search by partial email (e.g., "jane")
- ✅ Add multiple members for team view
- ✅ Check full calendar weekly

### ❌ Don't

- ❌ Keep filters on permanently (might miss updates)
- ❌ Search for people outside company
- ❌ Expect filters to save on close
- ❌ Use filters to hide assigned work
- ❌ Rely only on filtered view

---

## Keyboard Navigation

### To Search Without Mouse

1. Click in filter box (or press `/`)
2. Type member email or name
3. Press `Tab` to navigate suggestions
4. Press `Enter` to select
5. Press `Escape` to close

---

## Performance Tips

### Make Filtering Faster

1. **Clear cache regularly** - Keeps search quick
2. **Search with 3+ chars** - Better suggestions
3. **Select 5 or fewer members** - Faster updates
4. **Use specific email** - More accurate results
5. **Refresh if slow** - Clears temporary issues

---

## What's New?

### Version 1.0.0 Features (Today!)

- ✨ Real-time member search
- ✨ Multi-member filtering
- ✨ Smart email suggestions
- ✨ Performance optimizations
- ✨ Responsive mobile design
- ✨ Comprehensive documentation

### Coming Soon

- 🚀 Advanced filters (type, priority, date)
- 🚀 Save filter presets
- 🚀 Export calendar views
- 🚀 Calendar sharing
- 🚀 Email notifications

---

## Still Have Questions?

**Check these resources in order:**

1. This Quick Start Guide (you're reading it!)
2. CALENDAR_FILTERING_GUIDE.md
3. CALENDAR_API_REFERENCE.md
4. CALENDAR_IMPLEMENTATION_SUMMARY.md
5. Ask your team lead or admin

---

## Summary Cheat Sheet

| Task | Steps |
|------|-------|
| **Open Calendar** | Menu → Calendar |
| **Search Member** | Click filter → Type name |
| **Select Member** | Click suggestion |
| **Add Another** | Repeat search steps |
| **Remove One** | Click ✕ on tag |
| **Clear All** | Click "Clear all filters" |
| **View Events** | Calendar auto-updates |
| **Change Views** | Click Month/Week/Day |

---

**Happy Filtering! 🎉**

*Last Updated: April 17, 2026*  
*Version: 1.0.0*
