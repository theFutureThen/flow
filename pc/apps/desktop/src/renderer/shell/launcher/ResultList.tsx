import type { SearchHit } from './useCommandSearch';

interface Props {
  hits: SearchHit[];
  activeIndex: number;
  onSelect: (id: string) => void;
}

export function ResultList({ hits, activeIndex, onSelect }: Props) {
  if (hits.length === 0) {
    return <div className="launcher__empty">无匹配指令</div>;
  }

  return (
    <ul className="launcher__results">
      {hits.map((hit, index) => (
        <li
          key={hit.id}
          className={
            index === activeIndex ? 'launcher__row launcher__row--active' : 'launcher__row'
          }
          // 用 mouseDown 而非 click：click 之前窗口已因失焦隐藏
          onMouseDown={() => onSelect(hit.id)}
        >
          {hit.title}
        </li>
      ))}
    </ul>
  );
}
