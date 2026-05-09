use knife_4_summer_rs::{knife4j_router, Knife4jConfig, Knife4jGroup};

#[tokio::main]
async fn main() {
    let app = knife4j_router(Knife4jConfig {
        group_name: "petstore".to_string(),
        groups: vec![Knife4jGroup {
            name: "Petstore v2".to_string(),
            url: "https://petstore.swagger.io/v2/swagger.json".to_string(),
            location: "https://petstore.swagger.io/v2/swagger.json".to_string(),
            swagger_version: "2.0".to_string(),
        }],
        ..Default::default()
    });

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8092")
        .await
        .expect("bind 127.0.0.1:8092");

    println!("Knife4j Petstore docs: http://127.0.0.1:8092/doc.html");
    axum::serve(listener, app.into_make_service())
        .await
        .expect("serve petstore example");
}
