# Yotei3D

A lightweight WebGL-based 3D rendering engine designed with simplicity and ease of use in mind—even for users with minimal 3D programming experience.

---

### Beginner-Friendly Design

  Yotei3D allows you to start building interactive 3D scenes with just a few lines of code. Perfect for developers with limited 3D knowledge.

### User-Centric Architecture

  Built around intuitive components like `Renderer`, `Scene`, and ready-to-use objects (`Cube`, `Sphere`, etc.), plus a built-in viewer controller for camera interaction.

### Lightweight & Memory-Efficient

  Designed to be small and fast, Yotei3D minimizes memory usage and avoids unnecessary rendering overhead, making it ideal for web-based apps and low-power devices.

### Powerful When Needed

  While easy to start, Yotei3D also offers advanced features like realistic shadow mapping, a flexible particle system, post-processing effects, and more.

---

## 📥 Installation

```bash
npm install @unvell/yotei3d
```

---

## 🚀 Getting Started

```js
import { Renderer, Scene, Shapes } from '@unvell/yotei3d';

const renderer = new Renderer();
const scene = renderer.createScene();

const cube = new Shapes.Cube();
scene.add(cube);
scene.show();
```

Yotei3D handles camera control, rendering setup, and interaction for you—so you can focus on building.

---

## 🌟 Advanced Capabilities

- Shadow rendering with soft edges  
- Post-processing effects (e.g., bloom, blur)  
- 2D overlay rendering  
- Dynamic texture loading and more...

---

## 🗺️ Demo Examples

Visit the `/examples/` folder or open `helloworld.html` to explore how easily you can create interactive 3D scenes.
