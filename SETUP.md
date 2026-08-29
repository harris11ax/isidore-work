# Portfolio Website Setup Guide

## Overview
Your portfolio website has been completely redesigned with a clean, simple layout. It includes:
- **Navigation**: Home, Electronics, Policy, Photography, Contact
- **Home Page**: Biography section with headshot and introduction
- **Portfolio Pages**: Electronics, Policy, and Photography with project showcases
- **Contact Page**: Email address and social media buttons (LinkedIn, Instagram)
- **Admin Panel**: Hidden login page to manage projects without editing code
- **Responsive Design**: Works great on desktop and mobile devices

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

This will install the necessary packages including React and all Astro integrations.

### 2. Customize Your Information
Edit `src/consts.ts` to add your actual information:
```typescript
export const EMAIL = "your-email@example.com";
export const LINKEDIN_URL = "https://linkedin.com/in/yourprofile";
export const INSTAGRAM_URL = "https://instagram.com/yourhandle";
```

Also update `src/components/Header.astro` if you want to change the site title.

### 3. Add Your Headshot
Replace the placeholder image at `/public/blog-placeholder-about.jpg` with your actual headshot photo. The image should be roughly square (1:1 aspect ratio) for best results.

### 4. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to see your site.

## Admin Panel

### Accessing the Admin Panel
1. Navigate to `/admin` (e.g., `http://localhost:3000/admin`)
2. Login with password: `admin123` (you can change this later)
3. You can now add, edit, and delete projects

### Adding Projects
1. Go to Admin Panel
2. Select a category (Electronics, Policy, or Photography)
3. Fill in:
   - **Project Name**: Title of your project
   - **Description**: Brief description (shows on portfolio page)
   - **Image URL**: Path to image (e.g., `/blog-placeholder-1.jpg` or URL to external image)
   - **URL Slug**: URL-friendly name (e.g., `my-awesome-project` - no spaces)
4. Click "Add Project"

### Managing Projects
- **Edit**: Click the Edit button to modify a project
- **Delete**: Click the Delete button to remove a project

### Images
You can use:
- Placeholder images included: `/blog-placeholder-1.jpg` through `/blog-placeholder-5.jpg`
- External URLs: Any public image URL
- Your own images: Upload them to `/public/` and reference them as `/your-image.jpg`

### Changing Admin Password
Edit `src/pages/admin.astro` and change the password check from:
```javascript
if (password === 'admin123') {
```
to your preferred password.

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── Header.astro    # Navigation
│   └── Footer.astro    # Contact buttons & footer
├── layouts/
│   └── Layout.astro    # Main page layout
├── pages/
│   ├── index.astro     # Home page
│   ├── electronics.astro
│   ├── policy.astro
│   ├── photography.astro
│   ├── contact.astro
│   ├── admin.astro     # Hidden admin panel
│   ├── api/
│   │   ├── projects.ts      # Project API endpoints
│   │   └── projects.json    # Project data storage
│   └── [category]/
│       └── [slug].astro # Dynamic project detail pages
├── lib/
│   └── projects.ts     # Project utilities
└── styles/
    └── global.css      # Global styles

public/
├── blog-placeholder-1.jpg through 5.jpg  # Placeholder images
└── (add your images here)
```

## Features

### Clean Design
- No fancy scroll animations
- Simple, elegant layout
- Fast loading
- Focus on content

### Responsive
- Works on desktop, tablet, and mobile
- Touch-friendly buttons
- Readable on all screen sizes

### Project Grid
- Projects displayed 2 per row on desktop
- 1 per row on mobile
- Media on left, description on right
- Clickable cards link to project detail pages

### Contact Buttons
- Email, LinkedIn, Instagram
- Available in footer on every page
- Dedicated contact page
- Circular icon buttons

### Admin Panel
- Password-protected login
- Add/edit/delete projects
- Choose category when adding
- Session persists in browser

## Building for Production

### Local Preview
```bash
npm run preview
```

### Deploy to Cloudflare
The project is already configured for Cloudflare Workers deployment:
```bash
npm run deploy
```

## Customization Tips

### Colors
Edit the color variables in `src/styles/global.css`:
```css
:root {
	--accent: #2337ff;        /* Main accent color */
	--accent-dark: #000d8a;   /* Darker accent */
	--black: 15, 18, 25;      /* Text color */
	--gray: 96, 115, 159;     /* Light text */
	--gray-light: 229, 233, 240;  /* Light backgrounds */
}
```

### Typography
The site uses the "Atkinson" font which is included. Modify font sizes and styles in:
- `src/styles/global.css` for global changes
- Individual `.astro` files for component-specific changes

### Layout
Edit the grid layouts in `src/styles/global.css`:
```css
.project-grid {
	grid-template-columns: 1fr 1fr;  /* 2 columns */
	gap: 3em;
}
```

## Troubleshooting

### Projects not showing
1. Check that you've added projects in the admin panel
2. Clear browser cache
3. Restart development server

### Admin panel not working
1. Ensure you're visiting `/admin`
2. Check browser console for errors (F12)
3. Make sure you have the correct password

### Images not loading
1. Verify the image URL is correct
2. For local images, ensure they're in `/public/`
3. Check that image format is supported (JPG, PNG, WebP, etc.)

### Styles not updating
1. Clear browser cache (Ctrl+Shift+Del)
2. Restart dev server
3. Hard refresh (Ctrl+Shift+R)

## Next Steps

1. ✅ Complete setup (this file)
2. ✅ Install dependencies: `npm install`
3. ✅ Update contact info in `src/consts.ts`
4. ✅ Add your headshot to `/public/`
5. ✅ Start dev server: `npm run dev`
6. ✅ Visit admin panel at `/admin`
7. ✅ Add your projects
8. ✅ Customize colors and content as desired
9. ✅ Deploy to Cloudflare or your hosting provider

## Support

For more information about Astro, visit https://astro.build/docs
For Cloudflare deployment docs: https://developers.cloudflare.com/workers/

Enjoy your new portfolio website!
