<p align="center">
  <img src="public/logo.svg" alt="artkit logo" width="80" height="80">
</p>

# artkit

A web-based graphics editor for sprites, pixel art, and SVG.

**Live Demo:** https://artkit.web.app/

## Features

### Current
- **Sprite Editor** - Extract frames from sprite sheets using polygon selection
- **AI Background Removal** - One-click background removal powered by [RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) (runs entirely in browser via [Transformers.js](https://huggingface.co/docs/transformers.js))
- **Image Converter** - Convert images between WebP, JPEG, and PNG formats
- **Sound Editor** - Convert audio formats and trim/cut audio files
- **Project Management** - Save/load projects with IndexedDB
- **Dark/Light Theme** - System-aware theme support
- **Layer Support** - Multi-layer editing with a layers panel, visibility/lock/opacity, and alpha masks

### Planned
- SVG editing
- Pixel art drawing
- Tablet pressure-sensitive brushes

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3005](http://localhost:3005) in your browser.

## Tech Stack

- [Next.js 16](https://nextjs.org/) - React framework
- [React 19](https://react.dev/) - UI library
- [Tailwind CSS 4](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## License

[Apache License 2.0](LICENSE)

Commercial use, modification, and redistribution are allowed under Apache 2.0.
If you redistribute Artkit or ship a product or service that includes
substantial portions of this codebase, you must preserve the license and
attribution notices in [LICENSE](LICENSE)
and [NOTICE](NOTICE).

Suggested attribution:
"This product includes software from Artkit (https://github.com/aldegad/artkit)."
