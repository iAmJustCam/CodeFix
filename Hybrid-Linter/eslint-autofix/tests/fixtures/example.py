
def calculate_total(subtotal, tax, shipping):
    discount = 10  # This variable is unused
    return subtotal + tax + shipping

if __name__ == "__main__":
    print(calculate_total(100, 8, 5))
  