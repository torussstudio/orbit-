import { useState, useRef, useEffect } from 'react';

export default function MemberFilter({
  members = [],
  selectedMembers = [],
  searchResults = [],
  searchQuery = '',
  onSearchChange,
  onToggleMember,
  onClearFilters,
  isLoading = false,
  placeholder = 'Search members by email...'
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    onSearchChange(value);
    setShowDropdown(value.length > 0);
  };

  const handleSelectMember = (member) => {
    onToggleMember(member.id);
    inputRef.current?.focus();
  };

  const getSelectedMemberNames = () => {
    return selectedMembers.map(id => members.find(m => m.id === id)?.name).filter(Boolean);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Label */}
      <label style={{
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--text-2)',
        marginBottom: '6px',
        display: 'block'
      }}>
        Filter by Members
      </label>

      {/* Input */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => searchQuery && setShowDropdown(true)}
          className="form-input"
          style={{
            marginBottom: '8px',
            paddingRight: '32px',
            position: 'relative',
            zIndex: 2
          }}
        />
        
        {/* Loading spinner */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px'
          }}>
            ⟳
          </div>
        )}
      </div>

      {/* Dropdown with suggestions */}
      {showDropdown && searchResults.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow)',
            zIndex: 1000,
            maxHeight: '200px',
            overflowY: 'auto',
            marginTop: '-4px'
          }}
        >
          {searchResults.map(member => (
            <div
              key={member.id}
              onClick={() => handleSelectMember(member)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background-color 0.15s',
                background: selectedMembers.includes(member.id) ? 'var(--accent-light)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                if (!selectedMembers.includes(member.id)) {
                  e.currentTarget.style.background = 'var(--bg-3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selectedMembers.includes(member.id)) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                  {member.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  {member.email}
                </div>
              </div>
              {selectedMembers.includes(member.id) && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected members tags */}
      {selectedMembers.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-3)',
            marginBottom: '8px',
            textTransform: 'uppercase'
          }}>
            Active Filters: {selectedMembers.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {selectedMembers.map(memberId => {
              const member = members.find(m => m.id === memberId);
              return member ? (
                <div
                  key={memberId}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '12px',
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {member.name}
                  <button
                    onClick={() => onToggleMember(memberId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0',
                      display: 'flex'
                    }}
                    title="Remove filter"
                  >
                    ✕
                  </button>
                </div>
              ) : null;
            })}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClearFilters}
            style={{ fontSize: '11px' }}
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {showDropdown && searchResults.length === 0 && searchQuery.length >= 2 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px',
            textAlign: 'center',
            color: 'var(--text-3)',
            fontSize: '12px',
            zIndex: 1000,
            marginTop: '-4px'
          }}
        >
          No members found
        </div>
      )}
    </div>
  );
}
