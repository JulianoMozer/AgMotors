import gulp from 'gulp';
import imagemin from 'gulp-imagemin';

function optimizeImages() {
  return gulp.src('src/img/**/*')
    .pipe(imagemin())
    .pipe(gulp.dest('dist/img'));
}

export default optimizeImages;