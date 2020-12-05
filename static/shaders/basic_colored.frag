varying lowp vec3 v_color;
varying lowp vec3 v_normal;
varying highp vec4 v_light_proj_pos;

uniform lowp vec3 u_light_diffuse;
uniform lowp vec3 u_light_ambient;
uniform sampler2D u_shadow_map;

void main (void)
{
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

	lowp vec3 c_diff = v_color * u_light_diffuse * shading;
	lowp vec3 c_ambi = v_color * u_light_ambient;

	gl_FragColor = vec4(c_ambi + c_diff, 1.0);

}
