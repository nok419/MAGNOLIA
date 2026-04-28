type TabListItem = {
  id: string
  label: string
}

type TabListProps = {
  items: TabListItem[]
  activeId: string
  onChange: (id: string) => void
  label: string
}

export function TabList({ items, activeId, onChange, label }: TabListProps) {
  return (
    <div className="common-tab-list" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          className={`common-tab-list__tab${item.id === activeId ? " common-tab-list__tab--active" : ""}`}
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
