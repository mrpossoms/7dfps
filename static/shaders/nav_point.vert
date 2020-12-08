attribute vec3 a_position;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

void main (void)
{
    mediump vec4 world_pos = u_view * u_model * vec4(a_position, 1.0);
    gl_Position = u_proj * world_pos;
    gl_PointSize = 5.0 / (length(world_pos) * 0.01);
}
