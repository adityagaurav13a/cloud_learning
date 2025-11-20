import pytest

@pytest.fixture
def test_sum():
    return (2,3)

def add(a, b):
    return a + b


def test_addition(test_sum):
    a, b = test_sum
    # assert not add(a, b) == 6
    result = add(a, b)
    if result != 5:
        raise Exception(ValueError("Test Failed: The sum is incorrect."))
    else:
        print("\n🎉 Test Passed: Addition is correct! 🎉")



def test_addition_exception(test_sum):
    a, b = test_sum
    with pytest.raises(ValueError):
        if add(a, b) != 6:
            raise ValueError("Forced failure for testing exception")
        else:
            print("\n🎉 Test Passed: Exception raised as expected! 🎉")
        


@pytest.mark.parametrize("a, b, expected", [
    (10, 5, 15),
    (20, 30, 50),
    (0, 0, 0),
])
def test_addition_parametrized(a, b, expected):
    result = add(a, b)
    if result != expected:
        raise Exception(ValueError(f"Test Failed: Expected {expected}, got {result}."))
    else:
        print(f"\n🎉 Test Passed: {a} + {b} = {expected}! 🎉 ")




def test_addition_skipped(test_sum):
    a, b = test_sum
    result = add(3,2)
    if result != 5:
        # raise Exception(ValueError("Test Failed: The sum is incorrect.")
        pytest.skip("Skipping this test for demonstration purposes.")
    else:
        print("\n🎉 Test Passed: Addition is correct! 🎉")



@pytest.mark.skip(reason="Feature not implemented yet")
def test_addition_skip(test_sum):
    a, b = test_sum
    assert add(a, b) == 5


class calculator:
    def __init__(self, a, b):
        self.a = a
        self.b = b

    def add(self):
        return self.a + self.b
    
    def substract(self):
        return self.a - self.b 
    
    def multiply(self):
        return self.a * self.b

def test_calculator_operations():
    c = calculator(10, 5)
    assert c.add() == 15
    assert c.substract() == 5
    assert c.multiply() == 50
