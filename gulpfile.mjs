import gulp from 'gulp';
import imagemin from 'gulp-imagemin';
import { rm } from 'node:fs/promises';

const paths = {
  html: { src: 'src/**/*.html', dest: 'dist/' },
  css: { src: 'src/css/**/*.css', dest: 'dist/css/' },
  js: { src: 'src/js/**/*.js', dest: 'dist/js/' },
  images: { src: 'src/img/**/*.{jpg,jpeg,png,svg,webp}', dest: 'dist/img/' },
  static: { src: ['src/robots.txt', 'src/sitemap.xml'], dest: 'dist/' }
};

export async function clean() {
  await rm('dist', { recursive: true, force: true });
}

export function copyHTML() { return gulp.src(paths.html.src).pipe(gulp.dest(paths.html.dest)); }
export function copyCSS() { return gulp.src(paths.css.src).pipe(gulp.dest(paths.css.dest)); }
export function copyJS() { return gulp.src(paths.js.src).pipe(gulp.dest(paths.js.dest)); }
export function copyStatic() { return gulp.src(paths.static.src).pipe(gulp.dest(paths.static.dest)); }
export function optimizeImages() { return gulp.src(paths.images.src, { encoding: false }).pipe(imagemin()).pipe(gulp.dest(paths.images.dest)); }

export const build = gulp.series(clean, gulp.parallel(copyHTML, copyCSS, copyJS, copyStatic, optimizeImages));

export function watch() {
  gulp.watch(paths.html.src, copyHTML);
  gulp.watch(paths.css.src, copyCSS);
  gulp.watch(paths.js.src, copyJS);
  gulp.watch(paths.images.src, optimizeImages);
  gulp.watch(paths.static.src, copyStatic);
}

export const dev = gulp.series(build, watch);
export default build;
