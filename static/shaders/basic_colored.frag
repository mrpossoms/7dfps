varying lowp vec3 v_color;
varying lowp vec3 v_normal;
varying highp vec4 v_light_proj_pos;

uniform lowp vec3 u_hue;

uniform lowp vec3 u_light_diffuse;
uniform lowp vec3 u_light_ambient;
uniform sampler2D u_shadow_map;

void main (void)
{
	const lowp vec3 emiss_magenta = vec3(255.0, 67.0, 226.0) / 255.0;
	const lowp vec3 emiss_green = vec3(79.0, 124.0, 16.0) / 255.0;
	const lowp vec3 emiss_teal = vec3(153.0, 198.0, 255.0) / 255.0;

	if (distance(v_color, emiss_magenta) < 0.001 ||
		distance(v_color, emiss_green) < 0.001 ||
		distance(v_color, emiss_teal) < 0.001)
	{
		gl_FragColor = vec4(v_color * 1.5, 1.0);
		return;
	}

	lowp vec3 normal = normalize(v_normal);
	lowp vec3 light_dir = normalize(v_light_proj_pos.xyz);
	//lowp float bias = 0.00001;
	lowp float bias = mix(0.0001, 0.00001, dot(v_normal, light_dir));

	highp float depth = v_light_proj_pos.z - bias;
	mediump float shadowing = 0.0;


	for(lowp float y = -2.0; y <= 2.0; y++)
	for(lowp float x = -2.0; x <= 2.0; x++)
	{
		highp float sampled_depth = texture2D(u_shadow_map, v_light_proj_pos.xy + (vec2(x, y) * 0.0005)).r;

		if (depth <= sampled_depth)
		{
			shadowing += 1.0 / 25.0;
		}
	}

	if (abs(dot(normal, light_dir)) < 0.1) { shadowing = 0.0; }

	lowp float ndl = max(0.0, dot(normal, light_dir));// + 1.0) / 2.0;
	lowp float shading = ndl * shadowing;//min(ndl, shadowing);
	// shadowing = max(0.4, shadowing);

	lowp vec3 c_diff = (v_color * u_hue) * u_light_diffuse * shading;
	lowp vec3 c_ambi = (v_color * u_hue) * u_light_ambient;

	gl_FragColor = vec4((c_ambi + c_diff), 1.0);

}
