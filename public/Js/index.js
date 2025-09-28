function searchProducts() {
    let query = document.getElementById("searchInput").value;
    if (query.trim() !== "") {
        alert("Search feature coming soon for: " + query);
    } else {
        alert("Please enter something to search.");
    }
}
