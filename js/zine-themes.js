// Zine Forge - zine theme registry
// A theme describes the visual style of the printed zine pages:
// paper color, ink color, and typography. Themes do NOT affect the app chrome.

(function () {
  var THEMES = [
    {
      id: 'classic',
      label: 'Classic (cream paper, serif)',
      paperBg: '#fbf6e8',
      inkColor: '#1b1b1b',
      headingFont: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      bodyFont: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      accent: '#8b6b3a'
    },
    {
      id: 'zine-white',
      label: 'Clean (white paper, sans)',
      paperBg: '#ffffff',
      inkColor: '#1b1b1b',
      headingFont: '"Public Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      bodyFont: '"Public Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      accent: '#005ea2'
    },
    {
      id: 'risograph',
      label: 'Risograph (off-white, red accent)',
      paperBg: '#f5f1e8',
      inkColor: '#141414',
      headingFont: '"Public Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      bodyFont: 'Georgia, "Times New Roman", serif',
      accent: '#d7263d'
    },
    {
      id: 'notebook',
      label: 'Notebook (lined blue paper)',
      paperBg: '#eef4fb',
      inkColor: '#1a2b4a',
      headingFont: 'Georgia, "Times New Roman", serif',
      bodyFont: '"Public Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      accent: '#2f6db5'
    },
    {
      id: 'newspaper',
      label: 'Newspaper (dense serif)',
      paperBg: '#f4f1ea',
      inkColor: '#111111',
      headingFont: '"Times New Roman", Times, Georgia, serif',
      bodyFont: '"Times New Roman", Times, Georgia, serif',
      accent: '#111111'
    },
    {
      id: 'dark',
      label: 'Dark (charcoal paper, light ink)',
      paperBg: '#1f1f23',
      inkColor: '#f0efe8',
      headingFont: '"Iowan Old Style", Georgia, serif',
      bodyFont: '"Iowan Old Style", Georgia, serif',
      accent: '#ffbe2e'
    }
  ];

  function getTheme(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return THEMES[0];
  }

  function listThemes() {
    return THEMES.slice();
  }

  // Emit an inline style object for a mini-page element given a theme.
  function pageStyle(theme) {
    if (!theme) theme = THEMES[0];
    return {
      background: theme.paperBg,
      color: theme.inkColor,
      fontFamily: theme.bodyFont,
      '--zf-page-ink': theme.inkColor,
      '--zf-page-paper': theme.paperBg,
      '--zf-page-heading-font': theme.headingFont,
      '--zf-page-body-font': theme.bodyFont,
      '--zf-page-accent': theme.accent
    };
  }

  window.ZFThemes = {
    getTheme: getTheme,
    listThemes: listThemes,
    pageStyle: pageStyle
  };
})();