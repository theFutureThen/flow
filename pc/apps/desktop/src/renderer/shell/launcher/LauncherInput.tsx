import { useState, type KeyboardEvent } from 'react';
import { ResultList } from './ResultList';
import { useCommandSearch } from './useCommandSearch';

export function LauncherInput() {
  const [value, setValue] = useState('');
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { hits, execute } = useCommandSearch(value, composing);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 组合态期间方向键与回车属于输入法（选字、翻页、上屏），
    // launcher 不能抢走，否则中日韩用户无法正常选词
    if (composing) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit !== undefined) void execute(hit.id);
    }
  }

  return (
    <div className="launcher">
      <input
        className="launcher__input"
        autoFocus
        value={value}
        placeholder="输入指令…"
        onChange={(event) => {
          setValue(event.target.value);
          setActiveIndex(0);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          setValue(event.currentTarget.value);
        }}
        onKeyDown={handleKeyDown}
      />
      <ResultList hits={hits} activeIndex={activeIndex} onSelect={(id) => void execute(id)} />
    </div>
  );
}
