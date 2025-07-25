import gulp from 'gulp';
import imagemin from 'gulp-imagemin';

const paths = {
  html: {
    src: 'src/**/*.html',
    dest: 'dist/'
  },
  css: {
    src: 'src/css/**/*.css',
    dest: 'dist/css/'
  },
  images: {
    src: 'src/img/**/*',
    dest: 'dist/img/'
  }
};

// Copia HTML
function copyHTML() {
  return gulp.src(paths.html.src)
    .pipe(gulp.dest(paths.html.dest));
}

// Copia CSS
function copyCSS() {
  return gulp.src(paths.css.src)
    .pipe(gulp.dest(paths.css.dest));
}

// Otimiza e copia imagens
function optimizeImages() {
  return gulp.src(paths.images.src)
    .pipe(imagemin())
    .pipe(gulp.dest(paths.images.dest));
}

// Watch: atualiza automaticamente ao salvar
function watchFiles() {
  gulp.watch(paths.html.src, copyHTML);
  gulp.watch(paths.css.src, copyCSS);
  gulp.watch(paths.images.src, optimizeImages);
}

// Tarefa padrão
const build = gulp.series(
  gulp.parallel(copyHTML, copyCSS, optimizeImages),
  watchFiles
);

export default build;
