import { useEffect } from 'react';

type ActiveButton = {
  timer: number;
  previousAriaBusy: string | null;
};

const DIRECT_ACTION_LABEL = /\b(book for|mark arrived|send to doctor|clock[ -]in|clock[ -]out|approve|reject|activate|deactivate|skip|log[ -]out|sign[ -]out|cancel appointment)\b/i;
const SHORT_FEEDBACK_MS = 420;
const ACTION_TIMEOUT_MS = 20_000;

/**
 * Adds a small in-button activity indicator consistently across the app without
 * replacing native buttons or changing their existing handlers. Business
 * actions that emit the shared IHMS result events stay busy until that result;
 * navigation and simple controls get a brief acknowledgement only.
 */
export function ButtonActivityFeedback() {
  useEffect(() => {
    const activeButtons = new Map<HTMLButtonElement, ActiveButton>();

    const clearButton = (button: HTMLButtonElement) => {
      const active = activeButtons.get(button);
      if (active) window.clearTimeout(active.timer);
      activeButtons.delete(button);
      delete button.dataset.ihmsLoading;
      if (active?.previousAriaBusy === null || active?.previousAriaBusy === undefined) {
        button.removeAttribute('aria-busy');
      } else {
        button.setAttribute('aria-busy', active.previousAriaBusy);
      }
    };

    const clearPendingButtons = () => {
      // The shared result event is emitted after the operation that produced it.
      // Clear all active indicators so no button is left spinning if operations
      // happen close together or a component unmounts during a route change.
      for (const button of activeButtons.keys()) clearButton(button);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      // Guard against duplicate submissions while an earlier request is active.
      if (button.dataset.ihmsLoading === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.trim();
      const typeAttribute = button.getAttribute('type')?.toLowerCase() || '';
      const isFormSubmit = Boolean(button.form) && (typeAttribute === '' || typeAttribute === 'submit');
      const invalidForm = isFormSubmit && Boolean(button.form?.querySelector(':invalid'));
      const isAction = !invalidForm && (isFormSubmit
        || button.dataset.ihmsAction === 'true'
        || DIRECT_ACTION_LABEL.test(label));
      const duration = isAction ? ACTION_TIMEOUT_MS : SHORT_FEEDBACK_MS;
      const previousAriaBusy = button.getAttribute('aria-busy');
      button.dataset.ihmsLoading = 'true';
      button.setAttribute('aria-busy', 'true');
      const timer = window.setTimeout(() => clearButton(button), duration);
      activeButtons.set(button, { timer, previousAriaBusy });
    };

    document.addEventListener('click', handleClick, true);
    const removedButtonObserver = new MutationObserver(() => {
      for (const button of activeButtons.keys()) {
        if (!document.documentElement.contains(button)) clearButton(button);
      }
    });
    removedButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('ihms:data-success-message', clearPendingButtons);
    window.addEventListener('ihms:data-error', clearPendingButtons);
    window.addEventListener('ihms:button-feedback-clear', clearPendingButtons);

    return () => {
      document.removeEventListener('click', handleClick, true);
      removedButtonObserver.disconnect();
      window.removeEventListener('ihms:data-success-message', clearPendingButtons);
      window.removeEventListener('ihms:data-error', clearPendingButtons);
      window.removeEventListener('ihms:button-feedback-clear', clearPendingButtons);
      clearPendingButtons();
    };
  }, []);

  return null;
}
