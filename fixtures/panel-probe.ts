// Exposes the injected panel to the preview page so its states can be eyeballed
// without loading the extension. Dev only, never shipped.
import * as ui from '../src/content/ui';

(window as unknown as Record<string, unknown>).__ui = ui;
