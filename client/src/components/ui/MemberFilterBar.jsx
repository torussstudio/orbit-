import { useEffect, useRef, useState } from 'react';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export default function MemberFilterBar({
  members = [],
  selectedMembers,
  onSelectionChange,
  isManager,
  userEmail,
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const normalizedUserEmail = normalizeEmail(userEmail);

  const availableMembers = members
    .filter((member) => member?.active !== false)
    .filter((member) => normalizeEmail(member.email) !== normalizeEmail(''))
    .filter((member) => {
      const memberEmail = normalizeEmail(member.email);
      return memberEmail && memberEmail !== normalizedUserEmail;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedEmails = new Set(
    selectedMembers.map((member) => normalizeEmail(member.email)),
  );
  const query = search.trim().toLowerCase();

  const suggestions = availableMembers
    .filter((member) => !selectedEmails.has(normalizeEmail(member.email)))
    .filter((member) => {
      if (!query) return true;
      return (
        member.name.toLowerCase().includes(query) ||
        normalizeEmail(member.email).includes(query)
      );
    });

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectMember = (member) => {
    if (selectedMembers.some((selected) => normalizeEmail(selected.email) === normalizeEmail(member.email))) {
      return;
    }

    onSelectionChange([...selectedMembers, member]);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleRemoveMember = (email) => {
    onSelectionChange(
      selectedMembers.filter((member) => normalizeEmail(member.email) !== normalizeEmail(email)),
    );
  };

  const handleClearAll = () => {
    onSelectionChange([]);
    setSearch('');
    setIsOpen(false);
  };

  const helperText = isManager
    ? selectedMembers.length > 0
      ? 'Showing the selected members. Clear filters to return to the full company calendar.'
      : 'Managers can view the full company calendar or narrow it to specific members.'
    : selectedMembers.length > 0
      ? 'Showing your tasks and events plus the selected members.'
      : 'Your calendar shows your own assigned work by default. Add members to compare schedules.';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--bg-3)',
        borderRadius: '8px',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          Filter by member
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Type a name or email"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />

          {isOpen && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                boxShadow: 'var(--shadow)',
                maxHeight: '220px',
                overflowY: 'auto',
                zIndex: 100,
              }}
            >
              {suggestions.length === 0 ? (
                <div
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: '12px',
                  }}
                >
                  No matching members
                </div>
              ) : (
                suggestions.map((member, index) => (
                  <button
                    key={member.id || member.email || index}
                    type="button"
                    onClick={() => handleSelectMember(member)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      border: 'none',
                      borderBottom: index < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.15s',
                      background: 'var(--bg-2)',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'var(--bg-3)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'var(--bg-2)';
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {member.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>
                      {member.email}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {selectedMembers.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            minHeight: '24px',
          }}
        >
          {selectedMembers.map((member) => (
            <div
              key={member.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '16px',
                background: 'var(--accent)',
                color: 'white',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{member.name}</span>
              <span style={{ opacity: 0.85 }}>{member.email}</span>
              <button
                type="button"
                onClick={() => handleRemoveMember(member.email)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label={`Remove ${member.email}`}
              >
                x
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleClearAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{helperText}</div>
    </div>
  );
}
