export function setProperties(element, properties, style) {
	Object.assign(element, properties);
	Object.assign(element.style, style);
}

export function createElement(type, properties, style) {
	var element = document.createElement(type);
	setProperties(element, properties, style);
	return element;
}
