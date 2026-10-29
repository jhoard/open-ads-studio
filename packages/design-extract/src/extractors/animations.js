/**
 * Extract animation, transition, and motion design patterns.
 */
export async function extractAnimations(page) {
  return page.evaluate(() => {
    const transitions = {};
    const animations = {};
    const timingFunctions = {};
    const durations = {};
    const delays = {};
    const transforms = {};
    const willChange = {};

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);

      // Transitions
      if (style.transition && style.transition !== 'all 0s ease 0s' && style.transition !== 'none') {
        transitions[style.transition] = (transitions[style.transition] || 0) + 1;
      }

      // Transition timing functions
      if (style.transitionTimingFunction && style.transitionTimingFunction !== 'ease') {
        timingFunctions[style.transitionTimingFunction] = (timingFunctions[style.transitionTimingFunction] || 0) + 1;
      }

      // Transition durations
      if (style.transitionDuration && style.transitionDuration !== '0s') {
        durations[style.transitionDuration] = (durations[style.transitionDuration] || 0) + 1;
      }

      // Transition delays
      if (style.transitionDelay && style.transitionDelay !== '0s') {
        delays[style.transitionDelay] = (delays[style.transitionDelay] || 0) + 1;
      }

      // Animations
      if (style.animationName && style.animationName !== 'none') {
        const anim = `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction}`;
        animations[anim] = (animations[anim] || 0) + 1;

        // Also track animation fill mode and iteration
        if (style.animationFillMode !== 'none') {
          const detail = `${style.animationName}: fill=${style.animationFillMode}, iteration=${style.animationIterationCount}, direction=${style.animationDirection}`;
          animations[detail] = (animations[detail] || 0) + 1;
        }
      }

      // Transform patterns (for scroll animations, hover effects)
      if (style.transform && style.transform !== 'none') {
        transforms[style.transform] = (transforms[style.transform] || 0) + 1;
      }

      // Will-change hints (reveals intended animations)
      if (style.willChange && style.willChange !== 'auto') {
        willChange[style.willChange] = (willChange[style.willChange] || 0) + 1;
      }
    }

    // Extract @keyframes with their actual steps
    const keyframeDetails = [];
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSKeyframesRule) {
              const steps = [];
              for (const keyframe of rule.cssRules) {
                steps.push({
                  offset: keyframe.keyText,
                  properties: keyframe.cssText
                    .replace(keyframe.keyText, '')
                    .replace(/[{}]/g, '')
                    .trim()
                    .split(';')
                    .map(p => p.trim())
                    .filter(Boolean)
                    .slice(0, 6),
                });
              }
              keyframeDetails.push({
                name: rule.name,
                steps: steps.slice(0, 5),
              });
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Detect scroll-driven animations via data attributes and classes
    const scrollAnimated = [];
    const scrollSelectors = [
      '[data-aos]', '[data-scroll]', '[data-animate]',
      '[class*="animate-"]', '[class*="fade-"]', '[class*="slide-"]',
      '[class*="reveal"]', '[class*="parallax"]',
      '.gsap-', '[data-gsap]', '[data-framer]',
    ];
    for (const sel of scrollSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const attr = sel.replace(/[\[\]*"']/g, '').split('=')[0];
          scrollAnimated.push({ selector: sel, count: els.length });
        }
      } catch (e) {}
    }

    function sortByFreq(obj) {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
    }

    return {
      transitions: sortByFreq(transitions),
      timingFunctions: sortByFreq(timingFunctions),
      durations: sortByFreq(durations),
      delays: sortByFreq(delays),
      animations: sortByFreq(animations),
      transforms: sortByFreq(transforms),
      willChange: sortByFreq(willChange),
      keyframeDetails: keyframeDetails.slice(0, 12),
      scrollAnimated,
    };
  });
}
