
Effect = function() {

};

PostFilter = function() {
  this.shader = null;
};

PostFilter.prototype = new Effect();

PostFilter.prototype.render = function(renderer) {
  renderer.useShader(this.shader);
  renderer.drawFrame();
};

GrayscaleFilter = function() {
  this.shader = null;
};

PostFilter.prototype = new Effect();

PostFilter.prototype.render = function(renderer) {
  renderer.useShader(this.shader);
  renderer.drawFrame();
};

