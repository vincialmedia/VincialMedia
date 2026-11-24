// Only the parts of three.js the hero scene uses, so the download stays small.
import {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry,
  DirectionalLight, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PMREMGenerator, PerspectiveCamera, PlaneGeometry, PointLight,
  SRGBColorSpace, Scene, Shape, ShapeGeometry, Vector3, WebGLRenderer
} from 'three';
window.THREE = {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry,
  DirectionalLight, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PMREMGenerator, PerspectiveCamera, PlaneGeometry, PointLight,
  SRGBColorSpace, Scene, Shape, ShapeGeometry, Vector3, WebGLRenderer
};
