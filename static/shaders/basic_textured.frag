varying lowp vec2 v_tex_coord;

uniform sampler2D u_texture;

void main (void)
{
    // gl_FragColor = vec4(vec3(texture2D(u_texture, v_tex_coord).x), 1.0);
    gl_FragColor = texture2D(u_texture, v_tex_coord);
}
