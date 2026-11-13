import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useEnterMotion } from '../../utils/motion';

/*
 * Wrapper that plays a shared enter preset (see utils/motion.js) when it
 * mounts. Use it for anything that appears conditionally: dropdowns, menus,
 * overlays, banners.
 *
 *   {open && <Motion preset="popover" className="…">…</Motion>}
 *
 * presets: overlay | dialog | popover | toast | drawer | fadeUp
 * `options` is passed to the preset (popover: { origin: 'top right' }).
 * `as` picks the element (default div). The ref is forwarded.
 */
const Motion = forwardRef(function Motion(
  { as: Tag = 'div', preset = 'fadeUp', options, children, ...props },
  forwardedRef,
) {
  const ref = useRef(null);
  useImperativeHandle(forwardedRef, () => ref.current);
  useEnterMotion(ref, preset, [], options);

  return (
    <Tag ref={ref} {...props}>
      {children}
    </Tag>
  );
});

export default Motion;
