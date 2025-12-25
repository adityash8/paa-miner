# PAA Dominator - Webflow Integration

This folder contains embeddable components for integrating PAA Dominator into your Webflow site.

## Setup

### 1. Add CSS Styles

Add the contents of `styles/paa-tool.css` to your Webflow site:
- Go to **Project Settings** → **Custom Code** → **Head Code**
- Wrap the CSS in `<style>` tags and paste it

Or link to the hosted version:
```html
<link rel="stylesheet" href="https://your-cdn.com/paa-tool.css">
```

### 2. Configure API Endpoint

In each embed file, update the `API_BASE` constant to point to your Cloudflare Worker:
```javascript
const API_BASE = 'https://your-worker.your-subdomain.workers.dev/api';
```

### 3. Add Embeds to Webflow Pages

#### Research Page (`/research`)
1. Create a new page in Webflow
2. Add an **Embed** element
3. Paste the contents of `embeds/research.html`

#### Dashboard Page (`/dashboard`)
1. Create a new page in Webflow
2. Add an **Embed** element
3. Paste the contents of `embeds/dashboard.html`

### 4. Memberstack Integration (Optional)

If using Memberstack for authentication:

1. The embeds automatically detect Memberstack and use its token
2. Make sure Memberstack is installed on your Webflow site
3. The `$memberstackDom.getCurrentToken()` method is used to get the auth token

If NOT using Memberstack, users need to set their token in localStorage:
```javascript
localStorage.setItem('paa_auth_token', 'your-token-here');
```

## Files

| File | Description |
|------|-------------|
| `embeds/research.html` | One-off PAA research tool - fetch questions, generate answers, export |
| `embeds/dashboard.html` | Tracker dashboard - manage keywords, view changes, find opportunities |
| `styles/paa-tool.css` | Shared CSS styles for all components |

## Customization

### Colors
Edit the CSS variables at the top of `paa-tool.css`:
```css
:root {
  --paa-primary: #6366f1;      /* Main brand color */
  --paa-primary-hover: #4f46e5; /* Button hover state */
  --paa-success: #10b981;       /* Success/new indicators */
  --paa-warning: #f59e0b;       /* Warning indicators */
  --paa-danger: #ef4444;        /* Error/delete indicators */
  /* ... more variables */
}
```

### Fonts
The components use system fonts by default. To use your Webflow fonts, update:
```css
#paa-research-tool,
#paa-tracker-dashboard {
  font-family: 'Your Font', sans-serif;
}
```

### Sizing
Adjust max-width and padding in the base styles:
```css
#paa-research-tool,
#paa-tracker-dashboard {
  max-width: 1200px;
  padding: 24px;
}
```

## Troubleshooting

### "Missing or invalid authorization header"
- Ensure Memberstack is properly installed
- Or set a valid token in localStorage

### CORS Errors
- Add your Webflow domain to the allowed origins in `worker/src/middleware/cors.ts`
- Redeploy the worker

### Styles Not Loading
- Check that CSS is properly added to Webflow's custom code
- Verify there are no CSS conflicts with your Webflow theme

### API Errors
- Check browser console for detailed error messages
- Verify the API_BASE URL is correct
- Ensure the Cloudflare Worker is deployed and running
