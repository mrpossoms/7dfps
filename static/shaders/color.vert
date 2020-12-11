attribute vec3 a_position;
attribute vec3 a_color;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

varying lowp vec3 v_color;

void main (void)
{
	highp vec4 v_world_pos = u_model * vec4(a_position, 1.0);
	gl_Position = u_proj * u_view * v_world_pos;

	v_color = a_color;
}
